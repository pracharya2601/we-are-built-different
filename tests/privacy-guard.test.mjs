import assert from "node:assert/strict";
import test from "node:test";

import {
  PrivacyGuardError,
  createPrivacySafeLlmGateway,
  scrubForLlm,
} from "../plugins/privacy-guard/src/index.ts";

test("structured and free-text personal data is tokenized without entering reports", () => {
  const email = "person@example.com";
  const phone = "(415) 555-0123";
  const result = scrubForLlm({
    account: {
      email,
      firstName: "Avery",
      workspaceId: "workspace-private-123",
    },
    input: `Please contact ${email} at ${phone}.`,
  });

  assert.deepEqual(result.value.account, {
    email: "[PII_EMAIL_1]",
    firstName: "[PII_PERSON_NAME_1]",
    workspaceId: "[PII_ACCOUNT_IDENTIFIER_1]",
  });
  assert.equal(
    result.value.input,
    "Please contact [PII_EMAIL_1] at [PII_PHONE_1].",
  );
  assert.equal(result.report.hadSensitiveData, true);
  assert.equal(result.report.counts.email, 2);
  assert.equal(JSON.stringify(result.report).includes(email), false);
  assert.equal(JSON.stringify(result.report).includes("Avery"), false);
});

test("credentials are removed and payment data is detected with a checksum", () => {
  const result = scrubForLlm({
    apiKey: "sk-test-secret-that-must-never-leave",
    input: "Charge card 4242 4242 4242 4242 for the renewal.",
  });

  assert.equal("apiKey" in result.value, false);
  assert.equal(
    result.value.input,
    "Charge card [PII_CREDIT_CARD_1] for the renewal.",
  );
  assert.equal(result.report.counts.credential, 1);
  assert.equal(result.report.counts["credit-card"], 1);
});

test("block mode prevents the provider transport from receiving sensitive data", async () => {
  let calls = 0;
  const events = [];
  const safeCall = createPrivacySafeLlmGateway({
    scrub: { mode: "block" },
    audit(event) {
      events.push(event);
    },
    async transport() {
      calls += 1;
      return { ok: true };
    },
  });

  await assert.rejects(
    () => safeCall({ input: "Email person@example.com" }),
    (error) =>
      error instanceof PrivacyGuardError &&
      error.code === "BLOCKED_SENSITIVE_DATA",
  );
  assert.equal(calls, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "llm.request.blocked");
  assert.equal(JSON.stringify(events).includes("person@example.com"), false);
});

test("gateway sends only sanitized requests and exposes metadata-only audit events", async () => {
  let providerRequest;
  let auditEvent;
  const safeCall = createPrivacySafeLlmGateway({
    audit(event) {
      auditEvent = event;
    },
    async transport(request) {
      providerRequest = request;
      return { id: "response-1" };
    },
  });

  const response = await safeCall({
    input: "My name is Jordan Lee and email is jordan@example.com.",
    password: "do-not-send-this",
  });

  assert.deepEqual(response, { id: "response-1" });
  assert.equal(
    providerRequest.input,
    "[PII_PERSON_NAME_1] and email is [PII_EMAIL_1].",
  );
  assert.equal("password" in providerRequest, false);
  assert.equal(auditEvent.kind, "llm.request.sanitized");
  assert.equal(JSON.stringify(auditEvent).includes("Jordan"), false);
});

test("custom detectors cover product-specific identifiers", () => {
  const result = scrubForLlm(
    { input: "Case BD-123456 requires a summary." },
    {
      customDetectors: [
        {
          name: "built-different-case-id",
          detect(value) {
            const match = /\bBD-\d{6}\b/u.exec(value);
            if (!match || match.index === undefined) return [];
            return [
              {
                category: "custom",
                end: match.index + match[0].length,
                start: match.index,
              },
            ];
          },
        },
      ],
    },
  );

  assert.equal(
    result.value.input,
    "Case [PII_CUSTOM_1] requires a summary.",
  );
  assert.equal(result.report.findings[0].detector, "built-different-case-id");
});

test("cyclic or non-plain data fails closed", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  assert.throws(
    () => scrubForLlm(cyclic),
    (error) =>
      error instanceof PrivacyGuardError && error.code === "UNSAFE_INPUT",
  );
  assert.throws(
    () => scrubForLlm({ createdAt: new Date() }),
    (error) =>
      error instanceof PrivacyGuardError && error.code === "UNSAFE_INPUT",
  );
  assert.throws(
    () => scrubForLlm({ score: Number.NaN }),
    (error) =>
      error instanceof PrivacyGuardError && error.code === "UNSAFE_INPUT",
  );
});

test("personal data in object keys is scrubbed without leaking through report paths", () => {
  const email = "dynamic.person@example.com";
  const result = scrubForLlm({
    [email]: {
      note: `Call 4155550123 or email ${email}.`,
    },
  });

  assert.deepEqual(result.value, {
    "[PII_EMAIL_1]": {
      note: "Call [PII_PHONE_1] or email [PII_EMAIL_1].",
    },
  });
  assert.equal(JSON.stringify(result.report).includes(email), false);
  assert.equal(
    result.report.findings.every((finding) => !finding.path.includes(email)),
    true,
  );
});

test("accessor properties fail closed without executing user code", () => {
  let getterCalls = 0;
  const request = {};
  Object.defineProperty(request, "input", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "person@example.com";
    },
  });

  assert.throws(
    () => scrubForLlm(request),
    (error) =>
      error instanceof PrivacyGuardError && error.code === "UNSAFE_INPUT",
  );
  assert.equal(getterCalls, 0);
});
