import { getDb } from "@/db";
import { withPlatformOwner } from "@/lib/auth";
import {
  CallConfigurationError,
  CallValidationError,
  createCallJob,
  enqueueCallAttempt,
  getCallDataEncryptionKey,
  getCallQueue,
  getCallRuntimeEnvironment,
  getVapiCallConfiguration,
  listCallLogs,
  parseCallRequest,
  protectCallRecipient,
  revealCallRecipient,
  revealCallResult,
} from "@/lib/calls";
import { appendAuditLog } from "@/lib/data";

export const runtime = "edge";

export const GET = withPlatformOwner(
  async function getCallLogs() {
    try {
      const db = getDb();
      const encryptionKey = getCallDataEncryptionKey(
        getCallRuntimeEnvironment(),
      );
      const logs = await listCallLogs(db);
      const calls = await Promise.all(
        logs.map(async ({ job, attempts }) => {
          const recipient = await revealCallRecipient(
            job.recipientDataCiphertext,
            encryptionKey,
          );
          return {
            id: job.id,
            workspaceId: job.workspaceId,
            recipient: {
              name: recipient.name,
              phoneNumber: maskPhoneNumber(
                recipient.phoneNumber,
                job.recipientPhoneLast4,
              ),
            },
            status: job.status,
            outcome: job.outcome,
            attemptCount: job.attemptCount,
            maxAttempts: job.maxAttempts,
            nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
            createdAt: job.createdAt.toISOString(),
            completedAt: job.completedAt?.toISOString() ?? null,
            attempts: await Promise.all(
              attempts.map(async (attempt) => ({
                id: attempt.id,
                number: attempt.attemptNumber,
                status: attempt.status,
                outcome: attempt.outcome,
                recipientReached: attempt.recipientReached,
                appointmentConfirmed: attempt.appointmentConfirmed,
                followUpRequired: attempt.followUpRequired,
                result: await revealCallResult(
                  attempt.resultCiphertext,
                  encryptionKey,
                ),
                endedReason: attempt.endedReason,
                failureCode: attempt.failureCode,
                failureMessage: attempt.failureMessage,
                scheduledAt: attempt.scheduledAt.toISOString(),
                startedAt: attempt.startedAt?.toISOString() ?? null,
                endedAt: attempt.endedAt?.toISOString() ?? null,
              })),
            ),
          };
        }),
      );
      return Response.json(
        { calls },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof CallConfigurationError) {
        return apiError("call_automation_not_configured", error.message, 503);
      }
      throw error;
    }
  },
);

export const POST = withPlatformOwner(
  async function createQueuedCall(request, _context, auth) {
    try {
      assertSameOrigin(request);
      const environment = getCallRuntimeEnvironment();
      const encryptionKey = getCallDataEncryptionKey(environment);
      const queue = getCallQueue(environment);
      void getVapiCallConfiguration(environment);
      const parsed = parseCallRequest(await readJson(request));
      const recipientDataCiphertext = await protectCallRecipient(
        parsed.recipient,
        encryptionKey,
      );
      const db = getDb();
      const created = await createCallJob(db, {
        workspaceId: auth.workspaceId,
        createdByUserId: auth.userId,
        recipientDataCiphertext,
        recipientPhoneLast4: parsed.recipient.phoneNumber.slice(-4),
        maxAttempts: parsed.maxAttempts,
      });

      let queued = false;
      try {
        queued = await enqueueCallAttempt(db, queue, {
          version: 1,
          jobId: created.job.id,
          attemptId: created.attempt.id,
        });
      } catch (error) {
        console.error("Call job persisted but immediate enqueue failed", {
          jobId: created.job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await appendAuditLog(db, {
        workspaceId: auth.workspaceId,
        actorType: "user",
        actorId: auth.userId,
        action: "call_job.created",
        targetType: "call_job",
        targetId: created.job.id,
        requestId: request.headers.get("cf-ray"),
        metadata: {
          queued,
          maxAttempts: parsed.maxAttempts,
          phoneLast4: created.job.recipientPhoneLast4,
        },
      });

      return Response.json(
        {
          call: {
            id: created.job.id,
            status: queued ? "queued" : "scheduled",
            attemptId: created.attempt.id,
          },
        },
        {
          status: 202,
          headers: { "cache-control": "private, no-store" },
        },
      );
    } catch (error) {
      if (error instanceof CallValidationError) {
        return apiError(error.code, error.message, 400);
      }
      if (error instanceof CallConfigurationError) {
        return apiError("call_automation_not_configured", error.message, 503);
      }
      if (error instanceof RequestSecurityError) {
        return apiError(error.code, error.message, 403);
      }
      throw error;
    }
  },
);

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_000) {
    throw new CallValidationError(
      "request_too_large",
      "Call request must not exceed 32 KB.",
    );
  }
  try {
    const text = await request.text();
    if (text.length > 32_000) {
      throw new CallValidationError(
        "request_too_large",
        "Call request must not exceed 32 KB.",
      );
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof CallValidationError) throw error;
    throw new CallValidationError(
      "invalid_json",
      "Request body must contain valid JSON.",
    );
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new RequestSecurityError(
      "invalid_origin",
      "Call creation requires a same-origin browser request.",
    );
  }
}

class RequestSecurityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

function maskPhoneNumber(value: string, last4: string): string {
  return `${value.startsWith("+") ? "+" : ""}${"•".repeat(
    Math.max(4, value.replace(/\D/gu, "").length - 4),
  )}${last4}`;
}

function apiError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
