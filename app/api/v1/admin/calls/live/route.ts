import { getDb } from "@/db";
import { withPlatformOwner } from "@/lib/auth";
import {
  CallConfigurationError,
  getCallDataEncryptionKey,
  getCallRuntimeEnvironment,
  listActiveCallAttempts,
  listCallTranscriptLines,
  listPendingCallAttempts,
  revealCallRecipient,
  revealCallTranscriptText,
} from "@/lib/calls";

export const runtime = "edge";

type QueueEntry = {
  attemptId: string;
  jobId: string;
  recipientName: string;
  maskedPhoneNumber: string;
  attemptNumber: number;
  maxAttempts: number;
  status: string;
  at: string;
};

/**
 * The operator console polls this while it is open. It answers two questions
 * in one round trip: what is waiting in the call queue, and what is being said
 * on the call that is happening right now.
 */
export const GET = withPlatformOwner(async function getLiveCallState() {
  try {
    const db = getDb();
    const encryptionKey = getCallDataEncryptionKey(getCallRuntimeEnvironment());
    const [active, pending] = await Promise.all([
      listActiveCallAttempts(db),
      listPendingCallAttempts(db),
    ]);

    const onCall = active.filter((attempt) =>
      ["ringing", "in_progress"].includes(attempt.attemptStatus),
    );
    const transcriptLines = await listCallTranscriptLines(
      db,
      onCall.map((attempt) => attempt.attemptId),
    );

    const scheduled: QueueEntry[] = await Promise.all(
      pending.map(async (attempt) => ({
        attemptId: attempt.attemptId,
        jobId: attempt.jobId,
        ...(await identify(attempt, encryptionKey)),
        attemptNumber: attempt.attemptNumber,
        maxAttempts: attempt.maxAttempts,
        status: "scheduled",
        at: attempt.scheduledAt.toISOString(),
      })),
    );

    const dispatching: QueueEntry[] = await Promise.all(
      active
        .filter((attempt) =>
          ["queued", "dispatching", "provider_queued"].includes(
            attempt.attemptStatus,
          ),
        )
        .map(async (attempt) => ({
          attemptId: attempt.attemptId,
          jobId: attempt.jobId,
          ...(await identify(attempt, encryptionKey)),
          attemptNumber: attempt.attemptNumber,
          maxAttempts: attempt.maxAttempts,
          status: attempt.attemptStatus,
          at: attempt.scheduledAt.toISOString(),
        })),
    );

    const live = await Promise.all(
      onCall.map(async (attempt) => ({
        attemptId: attempt.attemptId,
        jobId: attempt.jobId,
        ...(await identify(attempt, encryptionKey)),
        attemptNumber: attempt.attemptNumber,
        maxAttempts: attempt.maxAttempts,
        status: attempt.attemptStatus,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        transcript: (
          await Promise.all(
            transcriptLines
              .filter((line) => line.attemptId === attempt.attemptId)
              .map(async (line) => ({
                speaker: line.speaker,
                text: await revealCallTranscriptText(
                  line.textCiphertext,
                  encryptionKey,
                ),
                spokenAt: line.spokenAt.toISOString(),
              })),
          )
        ).filter((line): line is {
          speaker: "agent" | "recipient";
          text: string;
          spokenAt: string;
        } => Boolean(line.text)),
      })),
    );

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        queues: { scheduled, dispatching },
        live,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof CallConfigurationError) {
      return Response.json(
        {
          error: {
            code: "call_automation_not_configured",
            message: error.message,
          },
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
});

async function identify(
  attempt: {
    recipientDataCiphertext: string;
    recipientPhoneLast4: string;
  },
  encryptionKey: string,
): Promise<{ recipientName: string; maskedPhoneNumber: string }> {
  const recipient = await revealCallRecipient(
    attempt.recipientDataCiphertext,
    encryptionKey,
  );
  return {
    recipientName: recipient.name,
    maskedPhoneNumber: maskPhoneNumber(
      recipient.phoneNumber,
      attempt.recipientPhoneLast4,
    ),
  };
}

function maskPhoneNumber(value: string, last4: string): string {
  return `${value.startsWith("+") ? "+" : ""}${"•".repeat(
    Math.max(4, value.replace(/\D/gu, "").length - 4),
  )}${last4}`;
}
