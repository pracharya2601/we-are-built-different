import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCallRequest,
} from "../lib/calls/validation.ts";
import {
  protectCallRecipient,
  revealCallRecipient,
} from "../lib/calls/protection.ts";
import { createVapiCall } from "../lib/calls/vapi.ts";
import { parseCallOutcome } from "../lib/calls/outcome.ts";

const recipient = {
  name: "Jordan Lee",
  phoneNumber: "+14155550123",
  dentalAvailability: "July 31 at 10:00 AM or 2:30 PM",
  approvedContext: "Confirm which appointment works.",
  timezone: "America/Los_Angeles",
  consentConfirmed: true,
};

test("call requests require E.164 numbers, consent, and bounded context", () => {
  assert.deepEqual(
    parseCallRequest({ ...recipient, maxAttempts: 3 }),
    { recipient, maxAttempts: 3 },
  );
  assert.throws(
    () => parseCallRequest({ ...recipient, phoneNumber: "415-555-0123" }),
    /E\.164/u,
  );
  assert.throws(
    () => parseCallRequest({ ...recipient, consentConfirmed: false }),
    /Documented permission/u,
  );
  assert.throws(
    () =>
      parseCallRequest({
        ...recipient,
        approvedContext: "x".repeat(2_001),
      }),
    /no more than 2000/u,
  );
});

test("recipient packets are encrypted before persistence", async () => {
  const key = "test-only-call-encryption-key-with-32-characters";
  const ciphertext = await protectCallRecipient(recipient, key);
  assert.doesNotMatch(ciphertext, /Jordan|14155550123/u);
  assert.deepEqual(await revealCallRecipient(ciphertext, key), recipient);
});

test("Vapi dispatch uses server credentials and ID-only idempotency", async () => {
  let captured;
  const response = await createVapiCall(
    {
      apiKey: "private-vapi-key",
      assistantId: "assistant-123",
      phoneNumberId: "phone-123",
      apiBaseUrl: "https://api.vapi.ai",
    },
    {
      attemptId: "cla_0123456789abcdef0123456789abcdef",
      jobId: "clj_0123456789abcdef0123456789abcdef",
      recipient,
    },
    async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return Response.json({ id: "vapi-call-123", status: "queued" });
    },
  );

  assert.deepEqual(response, { id: "vapi-call-123", status: "queued" });
  assert.equal(captured.url, "https://api.vapi.ai/call");
  assert.equal(captured.init.headers.authorization, "Bearer private-vapi-key");
  assert.equal(
    captured.init.headers["idempotency-key"],
    "cla_0123456789abcdef0123456789abcdef",
  );
  assert.equal(captured.body.customer.number, recipient.phoneNumber);
  assert.equal(
    captured.body.assistantOverrides.variableValues.dentalAvailability,
    recipient.dentalAvailability,
  );
  assert.equal("transcript" in captured.body, false);
  assert.equal("recording" in captured.body, false);
});

test("structured outcomes override provider ended-reason heuristics", () => {
  assert.deepEqual(
    parseCallOutcome({
      endedReason: "customer-ended-call",
      analysis: {
        structuredData: {
          outcome: "confirmed",
          recipientReached: true,
          appointmentConfirmed: true,
          followUpRequired: false,
          summary: "Recipient selected the morning appointment.",
          selectedAvailability: "July 31 at 10:00 AM",
        },
      },
    }),
    {
      outcome: "confirmed",
      recipientReached: true,
      appointmentConfirmed: true,
      followUpRequired: false,
      summary: "Recipient selected the morning appointment.",
      selectedAvailability: "July 31 at 10:00 AM",
    },
  );
  assert.equal(
    parseCallOutcome({ endedReason: "customer-did-not-answer" }).outcome,
    "no_answer",
  );
  assert.equal(
    parseCallOutcome({ endedReason: "provider-failed" }).outcome,
    "technical_failure",
  );
});

test("owner routes, queue messages, and environment resources stay isolated", async () => {
  const [route, worker, types, schema, wrangler] = await Promise.all([
    readFile(
      new URL("../app/api/v1/admin/calls/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/calls/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(route, /withPlatformOwner/u);
  assert.match(route, /status: 202/u);
  assert.match(route, /protectCallRecipient/u);
  assert.match(worker, /async queue/u);
  assert.match(worker, /dispatchDueCallAttempts/u);
  assert.match(types, /jobId: string/u);
  assert.match(types, /attemptId: string/u);
  assert.doesNotMatch(
    types.match(/export type CallQueueMessage = \{[^}]+\}/su)?.[0] ?? "",
    /phone|name|context/iu,
  );
  assert.match(schema, /workspaceId: text\("workspace_id"\)/u);
  assert.match(wrangler, /built-different-call-automation-local/u);
  assert.match(wrangler, /built-different-call-automation-staging/u);
});
