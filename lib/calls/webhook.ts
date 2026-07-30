import type { AppDatabase } from "../../db";
import { constantTimeEqual, encodeBase64Url, sha256 } from "../auth/crypto";
import {
  claimProviderEvent,
  completeProviderEvent,
  failProviderEvent,
} from "../events/inbox";
import { protectCallResult } from "./protection";
import { parseCallOutcome } from "./outcome";
import {
  findCallAttemptForWebhook,
  finishCallAttempt,
  updateCallProgress,
} from "./store";
import type { CallOutcome, CallResultData } from "./types";

export class VapiWebhookError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 404 | 500;

  constructor(
    code: string,
    message: string,
    status: 400 | 401 | 404 | 500,
  ) {
    super(message);
    this.name = "VapiWebhookError";
    this.code = code;
    this.status = status;
  }
}

export async function handleVapiWebhook(
  db: AppDatabase,
  input: {
    authorization: string | null;
    expectedToken: string;
    encryptionKey: string;
    body: unknown;
    onCallEnded?: (input: {
      callAttemptId: string;
      callJobId: string;
      outcome: CallOutcome;
    }) => Promise<void>;
  },
): Promise<{ accepted: true; duplicate: boolean }> {
  authenticateWebhook(input.authorization, input.expectedToken);
  const message = parseMessage(input.body);
  const call = readRecord(message, "call");
  const callId = readString(call, "id");
  if (!callId) {
    throw new VapiWebhookError(
      "missing_call_id",
      "Vapi webhook call ID is required.",
      400,
    );
  }

  const providerEventId = await createProviderEventId(callId, message);
  const claim = await claimProviderEvent(db, {
    provider: "vapi",
    providerEventId,
    eventType: readString(message, "type")!,
    payload: sanitizedPayload(callId, message),
  });
  if (!claim.claimed) return { accepted: true, duplicate: true };

  try {
    const metadata = readRecord(call, "metadata");
    const attempt = await findCallAttemptForWebhook(db, {
      providerCallId: callId,
      attemptId: readString(metadata, "callAttemptId") ?? undefined,
    });
    if (!attempt) {
      throw new VapiWebhookError(
        "unknown_call",
        "No local attempt matches this Vapi call.",
        404,
      );
    }

    if (message.type === "status-update") {
      const progress = progressStatus(readString(message, "status"));
      if (progress) {
        await updateCallProgress(db, {
          attemptId: attempt.id,
          jobId: attempt.jobId,
          status: progress,
        });
      }
    } else if (message.type === "end-of-call-report") {
      const parsed = parseCallOutcome(message);
      const result: CallResultData = {
        summary: parsed.summary,
        selectedAvailability: parsed.selectedAvailability,
      };
      const resultCiphertext =
        result.summary || result.selectedAvailability
          ? await protectCallResult(result, input.encryptionKey)
          : null;
      await finishCallAttempt(db, {
        attemptId: attempt.id,
        jobId: attempt.jobId,
        outcome: parsed.outcome,
        recipientReached: parsed.recipientReached,
        appointmentConfirmed: parsed.appointmentConfirmed,
        followUpRequired: parsed.followUpRequired,
        resultCiphertext,
        endedReason: readString(message, "endedReason"),
        endedAt: parseDate(readString(message, "timestamp")) ?? new Date(),
      });
      await input.onCallEnded?.({
        callAttemptId: attempt.id,
        callJobId: attempt.jobId,
        outcome: parsed.outcome,
      });
    }
    await completeProviderEvent(db, claim.id);
    return { accepted: true, duplicate: false };
  } catch (error) {
    await failProviderEvent(db, claim.id, error);
    throw error;
  }
}

function authenticateWebhook(
  authorization: string | null,
  expectedToken: string,
): void {
  const prefix = "Bearer ";
  const provided = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : "";
  if (!provided || !constantTimeEqual(provided, expectedToken)) {
    throw new VapiWebhookError(
      "invalid_webhook_authorization",
      "Vapi webhook authorization failed.",
      401,
    );
  }
}

function parseMessage(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.message)) {
    throw new VapiWebhookError(
      "invalid_payload",
      "Vapi webhook body must contain a message object.",
      400,
    );
  }
  const type = readString(body.message, "type");
  if (!type || !["status-update", "end-of-call-report"].includes(type)) {
    throw new VapiWebhookError(
      "unsupported_event",
      "Only Vapi call status and end-of-call events are accepted.",
      400,
    );
  }
  return body.message;
}

async function createProviderEventId(
  callId: string,
  message: Record<string, unknown>,
): Promise<string> {
  const fingerprint = [
    callId,
    readString(message, "type") ?? "",
    readString(message, "status") ?? "",
    readString(message, "endedReason") ?? "",
    readString(message, "timestamp") ?? "",
  ].join("\0");
  return `vapi_${encodeBase64Url((await sha256(fingerprint)).slice(0, 24))}`;
}

function sanitizedPayload(
  callId: string,
  message: Record<string, unknown>,
): Record<string, unknown> {
  return {
    callId,
    type: readString(message, "type"),
    status: readString(message, "status"),
    endedReason: limitedString(readString(message, "endedReason"), 200),
    timestamp: readString(message, "timestamp"),
  };
}

function progressStatus(
  status: string | null,
): "provider_queued" | "ringing" | "in_progress" | null {
  if (status === "scheduled" || status === "queued") {
    return "provider_queued";
  }
  if (status === "ringing") return "ringing";
  if (status === "in-progress" || status === "forwarding") {
    return "in_progress";
  }
  return null;
}

function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const selected = value[key];
  return isRecord(selected) ? selected : {};
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const selected = value[key];
  return typeof selected === "string" && selected.trim()
    ? selected.trim()
    : null;
}

function limitedString(
  value: string | null,
  maximum: number,
): string | null {
  return value ? value.slice(0, maximum) : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
