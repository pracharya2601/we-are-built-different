import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  protectCallTranscriptText,
  revealCallTranscriptText,
} from "../lib/calls/protection.ts";
import { handleVapiWebhook } from "../lib/calls/webhook.ts";

const ENCRYPTION_KEY = "test-only-call-encryption-key-with-32-characters";
const WEBHOOK_TOKEN = "test-only-webhook-token-of-24-plus-characters";
const ATTEMPT = {
  id: "cla_0123456789abcdef0123456789abcdef",
  jobId: "clj_0123456789abcdef0123456789abcdef",
  workspaceId: "wsp_0123456789abcdef0123456789abcdef",
  status: "in_progress",
};

test("a live transcript line is encrypted before it reaches the database", async () => {
  const ciphertext = await protectCallTranscriptText(
    "Does that include the cleaning?",
    ENCRYPTION_KEY,
  );
  assert.doesNotMatch(ciphertext, /cleaning/u);
  assert.equal(
    await revealCallTranscriptText(ciphertext, ENCRYPTION_KEY),
    "Does that include the cleaning?",
  );
  // A disposable line must not fail the operator's poll when a key rotates.
  assert.equal(
    await revealCallTranscriptText(ciphertext, "a-different-32-character-key-value"),
    null,
  );
});

test("only finalized utterances are stored, and each one keeps its speaker", async () => {
  const { db, inserted } = stubDatabase(ATTEMPT);

  const partial = await handleVapiWebhook(db, {
    ...webhookInput(),
    body: transcriptMessage({
      transcriptType: "partial",
      transcript: "Does that inc",
    }),
  });
  assert.deepEqual(partial, { accepted: true, duplicate: true });
  assert.equal(inserted.length, 0);

  const final = await handleVapiWebhook(db, {
    ...webhookInput(),
    body: transcriptMessage({
      role: "user",
      transcript: "Does that include the cleaning?",
    }),
  });
  assert.deepEqual(final, { accepted: true, duplicate: false });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].speaker, "recipient");
  assert.equal(inserted[0].attemptId, ATTEMPT.id);
  assert.equal(inserted[0].workspaceId, ATTEMPT.workspaceId);
  assert.doesNotMatch(JSON.stringify(inserted[0]), /cleaning/u);
  assert.equal(
    await revealCallTranscriptText(
      inserted[0].textCiphertext,
      ENCRYPTION_KEY,
    ),
    "Does that include the cleaning?",
  );

  const agentLine = await handleVapiWebhook(db, {
    ...webhookInput(),
    body: transcriptMessage({
      role: "assistant",
      transcript: "Yes, the cleaning is included.",
    }),
  });
  assert.deepEqual(agentLine, { accepted: true, duplicate: false });
  assert.equal(inserted[1].speaker, "agent");
});

test("a replayed delivery repeats the fingerprint the unique index dedupes on", async () => {
  const { db, inserted } = stubDatabase(ATTEMPT);
  const body = transcriptMessage({ transcript: "We have an opening Thursday." });
  await handleVapiWebhook(db, { ...webhookInput(), body });
  await handleVapiWebhook(db, { ...webhookInput(), body });

  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].fingerprint, inserted[1].fingerprint);
  assert.notEqual(inserted[0].id, inserted[1].id);
});

test("a transcript line that lands after the call ended is dropped", async () => {
  const { db, inserted } = stubDatabase({ ...ATTEMPT, status: "ended" });
  const result = await handleVapiWebhook(db, {
    ...webhookInput(),
    body: transcriptMessage({ transcript: "Late arrival after the purge." }),
  });

  assert.deepEqual(result, { accepted: true, duplicate: true });
  assert.equal(inserted.length, 0);
});

test("transcript callbacks stay authenticated and bounded like every other event", async () => {
  const { db, inserted } = stubDatabase(ATTEMPT);
  await assert.rejects(
    handleVapiWebhook(db, {
      ...webhookInput(),
      authorization: "Bearer wrong-token",
      body: transcriptMessage({ transcript: "Unauthenticated." }),
    }),
    /authorization failed/u,
  );
  await assert.rejects(
    handleVapiWebhook(db, {
      ...webhookInput(),
      body: { message: { type: "speech-update", call: { id: "vapi-call-1" } } },
    }),
    /transcript/u,
  );

  await handleVapiWebhook(db, {
    ...webhookInput(),
    body: transcriptMessage({ transcript: "x".repeat(5_000) }),
  });
  const stored = await revealCallTranscriptText(
    inserted[0].textCiphertext,
    ENCRYPTION_KEY,
  );
  assert.equal(stored.length, 2_000);
});

test("the live transcript is operator-only and cannot outlive the call", async () => {
  const [webhook, store, worker, route, board] = await Promise.all([
    read("../lib/calls/webhook.ts"),
    read("../lib/calls/store.ts"),
    read("../worker/index.ts"),
    read("../app/api/v1/admin/calls/live/route.ts"),
    read("../app/dashboard/admin/calls/live-call-board.tsx"),
  ]);

  // Inbox rows are permanent; a transcript line is not allowed to become one.
  assert.match(webhook, /if \(message\.type === "transcript"\)/u);
  assert.equal(
    webhook.indexOf('message.type === "transcript"') <
      webhook.indexOf("createProviderEventId(callId, message)"),
    true,
  );
  assert.doesNotMatch(
    webhook.match(/function sanitizedPayload\([^}]+\}[^}]+\}/su)?.[0] ?? "",
    /transcript/u,
  );

  // Ending an attempt purges it, and the cron covers a lost end-of-call.
  assert.match(store, /purgeCallTranscript\(db, input\.attemptId\)/u);
  assert.match(store, /export async function purgeStaleCallTranscripts/u);
  assert.match(worker, /purgeStaleCallTranscripts\(db\)/u);

  // Only a platform operator may read it, and never from a cache.
  assert.match(route, /withPlatformOwner/u);
  assert.match(route, /"cache-control": "private, no-store"/u);
  assert.match(board, /\/api\/v1\/admin\/calls\/live/u);
});

function webhookInput() {
  return {
    authorization: `Bearer ${WEBHOOK_TOKEN}`,
    expectedToken: WEBHOOK_TOKEN,
    encryptionKey: ENCRYPTION_KEY,
  };
}

function transcriptMessage(overrides) {
  return {
    message: {
      type: "transcript",
      role: "assistant",
      transcriptType: "final",
      timestamp: "2026-07-30T12:00:00.000Z",
      call: {
        id: "vapi-call-1",
        metadata: { callAttemptId: ATTEMPT.id, callJobId: ATTEMPT.jobId },
      },
      ...overrides,
    },
  };
}

/**
 * The transcript path touches exactly one read and one insert, so a chainable
 * stub is enough to assert what is written without a live D1 binding.
 */
function stubDatabase(attempt) {
  const inserted = [];
  const selection = {
    from: () => selection,
    where: () => selection,
    limit: async () => (attempt ? [attempt] : []),
  };
  return {
    inserted,
    db: {
      select: () => selection,
      insert: () => ({
        values: (values) => ({
          onConflictDoNothing: async () => {
            inserted.push(values);
          },
        }),
      }),
    },
  };
}

function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
