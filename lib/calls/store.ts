import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  lte,
  ne,
  notInArray,
} from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  callAttempts,
  callJobs,
  callTranscriptLines,
} from "../../db/schema.ts";
import { createId } from "../data/ids.ts";
import {
  ACTIVE_CALL_ATTEMPT_STATUSES,
  type CallOutcome,
  type CallQueue,
  type CallQueueMessage,
  type CallTranscriptSpeaker,
} from "./types.ts";

export async function createCallJob(
  db: AppDatabase,
  input: {
    workspaceId: string;
    createdByUserId: string;
    recipientDataCiphertext: string;
    recipientPhoneLast4: string;
    maxAttempts: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const jobId = createId("clj");
  const attemptId = createId("cla");
  const [job] = await db
    .insert(callJobs)
    .values({
      id: jobId,
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      recipientDataCiphertext: input.recipientDataCiphertext,
      recipientPhoneLast4: input.recipientPhoneLast4,
      status: "scheduled",
      maxAttempts: input.maxAttempts,
      attemptCount: 1,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [attempt] = await db
    .insert(callAttempts)
    .values({
      id: attemptId,
      jobId,
      workspaceId: input.workspaceId,
      attemptNumber: 1,
      status: "scheduled",
      scheduledAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { job, attempt };
}

export async function enqueueCallAttempt(
  db: AppDatabase,
  queue: CallQueue,
  input: CallQueueMessage,
): Promise<boolean> {
  const now = new Date();
  const [queued] = await db
    .update(callAttempts)
    .set({ status: "queued", updatedAt: now })
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        eq(callAttempts.jobId, input.jobId),
        eq(callAttempts.status, "scheduled"),
      ),
    )
    .returning({ id: callAttempts.id });
  if (!queued) return false;

  await db
    .update(callJobs)
    .set({ status: "queued", nextAttemptAt: null, updatedAt: now })
    .where(
      and(
        eq(callJobs.id, input.jobId),
        eq(callJobs.status, "scheduled"),
      ),
    );

  try {
    await queue.send(input);
    return true;
  } catch (error) {
    await db
      .update(callAttempts)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(
        and(
          eq(callAttempts.id, input.attemptId),
          eq(callAttempts.status, "queued"),
        ),
      );
    await db
      .update(callJobs)
      .set({
        status: "scheduled",
        nextAttemptAt: now,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(callJobs.id, input.jobId),
          eq(callJobs.status, "queued"),
        ),
      );
    throw error;
  }
}

export async function dispatchDueCallAttempts(
  db: AppDatabase,
  queue: CallQueue,
  now = new Date(),
): Promise<number> {
  const due = await db
    .select({
      attemptId: callAttempts.id,
      jobId: callAttempts.jobId,
    })
    .from(callAttempts)
    .where(
      and(
        eq(callAttempts.status, "scheduled"),
        lte(callAttempts.scheduledAt, now),
      ),
    )
    .orderBy(asc(callAttempts.scheduledAt))
    .limit(25);
  let dispatched = 0;
  for (const item of due) {
    try {
      if (
        await enqueueCallAttempt(db, queue, {
          version: 1,
          jobId: item.jobId,
          attemptId: item.attemptId,
        })
      ) {
        dispatched += 1;
      }
    } catch (error) {
      console.error("Failed to enqueue scheduled call attempt", {
        attemptId: item.attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return dispatched;
}

export async function claimQueuedCallAttempt(
  db: AppDatabase,
  input: CallQueueMessage,
) {
  const now = new Date();
  const [attempt] = await db
    .update(callAttempts)
    .set({
      status: "dispatching",
      failureCode: null,
      failureMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        eq(callAttempts.jobId, input.jobId),
        eq(callAttempts.status, "queued"),
      ),
    )
    .returning();
  if (!attempt) return null;

  const [job] = await db
    .select()
    .from(callJobs)
    .where(eq(callJobs.id, input.jobId))
    .limit(1);
  if (!job || ["canceled", "completed", "exhausted"].includes(job.status)) {
    await db
      .update(callAttempts)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(callAttempts.id, attempt.id));
    return null;
  }
  await db
    .update(callJobs)
    .set({ status: "in_progress", updatedAt: now })
    .where(eq(callJobs.id, job.id));
  return { attempt, job };
}

export async function markCallAccepted(
  db: AppDatabase,
  input: {
    attemptId: string;
    jobId: string;
    providerCallId: string;
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(callAttempts)
    .set({
      providerCallId: input.providerCallId,
      status: "provider_queued",
      updatedAt: now,
    })
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        eq(callAttempts.status, "dispatching"),
      ),
    );
  await db
    .update(callJobs)
    .set({ status: "queued", updatedAt: now })
    .where(eq(callJobs.id, input.jobId));
}

export async function markCallDispatchFailure(
  db: AppDatabase,
  input: {
    attemptId: string;
    jobId: string;
    code: string;
    message: string;
    retryable: boolean;
    ambiguous: boolean;
    retryAt: Date;
  },
): Promise<void> {
  const now = new Date();
  const safeMessage = input.message.slice(0, 500);
  if (input.retryable && !input.ambiguous) {
    await db
      .update(callAttempts)
      .set({
        status: "scheduled",
        scheduledAt: input.retryAt,
        failureCode: input.code,
        failureMessage: safeMessage,
        updatedAt: now,
      })
      .where(eq(callAttempts.id, input.attemptId));
    await db
      .update(callJobs)
      .set({
        status: "scheduled",
        outcome: "technical_failure",
        nextAttemptAt: input.retryAt,
        updatedAt: now,
      })
      .where(eq(callJobs.id, input.jobId));
    return;
  }

  await db
    .update(callAttempts)
    .set({
      status: "failed",
      outcome: "technical_failure",
      failureCode: input.code,
      failureMessage: safeMessage,
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(callAttempts.id, input.attemptId));
  await db
    .update(callJobs)
    .set({
      status: "review_required",
      outcome: "technical_failure",
      nextAttemptAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(callJobs.id, input.jobId));
}

export async function findCallAttemptForWebhook(
  db: AppDatabase,
  input: { providerCallId?: string; attemptId?: string },
) {
  if (input.providerCallId) {
    const [attempt] = await db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.providerCallId, input.providerCallId))
      .limit(1);
    if (attempt) return attempt;
  }
  if (input.attemptId) {
    const [attempt] = await db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.id, input.attemptId))
      .limit(1);
    if (attempt) return attempt;
  }
  return null;
}

export async function updateCallProgress(
  db: AppDatabase,
  input: {
    attemptId: string;
    jobId: string;
    status: "provider_queued" | "ringing" | "in_progress";
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(callAttempts)
    .set({
      status: input.status,
      startedAt:
        input.status === "in_progress" ? now : undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        ne(callAttempts.status, "ended"),
      ),
    );
  await db
    .update(callJobs)
    .set({
      status:
        input.status === "provider_queued" ? "queued" : "in_progress",
      updatedAt: now,
    })
    .where(eq(callJobs.id, input.jobId));
}

export async function finishCallAttempt(
  db: AppDatabase,
  input: {
    attemptId: string;
    jobId: string;
    outcome: CallOutcome;
    recipientReached: boolean | null;
    appointmentConfirmed: boolean | null;
    followUpRequired: boolean | null;
    resultCiphertext: string | null;
    endedReason: string | null;
    endedAt: Date;
  },
): Promise<void> {
  const [job] = await db
    .select()
    .from(callJobs)
    .where(eq(callJobs.id, input.jobId))
    .limit(1);
  if (!job || ["canceled", "completed", "exhausted"].includes(job.status)) {
    return;
  }

  const [endedAttempt] = await db
    .update(callAttempts)
    .set({
      status: "ended",
      outcome: input.outcome,
      recipientReached: input.recipientReached,
      appointmentConfirmed: input.appointmentConfirmed,
      followUpRequired: input.followUpRequired,
      resultCiphertext: input.resultCiphertext,
      endedReason: input.endedReason?.slice(0, 200) ?? null,
      endedAt: input.endedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        ne(callAttempts.status, "ended"),
      ),
    )
    .returning({ id: callAttempts.id });
  if (!endedAttempt) return;

  // The live transcript exists only while the recipient is on the phone.
  await purgeCallTranscript(db, input.attemptId);

  const retryable = [
    "no_answer",
    "busy",
    "voicemail",
    "technical_failure",
  ].includes(input.outcome);
  if (retryable && job.attemptCount < job.maxAttempts) {
    const nextAttemptNumber = job.attemptCount + 1;
    const retryAt = nextRetryAt(input.endedAt, job.attemptCount);
    await db
      .insert(callAttempts)
      .values({
        id: createId("cla"),
        jobId: job.id,
        workspaceId: job.workspaceId,
        attemptNumber: nextAttemptNumber,
        status: "scheduled",
        scheduledAt: retryAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [callAttempts.jobId, callAttempts.attemptNumber],
      });
    await db
      .update(callJobs)
      .set({
        status: "scheduled",
        outcome: input.outcome,
        attemptCount: nextAttemptNumber,
        nextAttemptAt: retryAt,
        updatedAt: new Date(),
      })
      .where(eq(callJobs.id, job.id));
    return;
  }

  const needsReview = [
    "unclear",
    "reschedule_requested",
    "technical_failure",
  ].includes(input.outcome);
  await db
    .update(callJobs)
    .set({
      status: retryable
        ? "exhausted"
        : needsReview
          ? "review_required"
          : "completed",
      outcome: input.outcome,
      nextAttemptAt: null,
      completedAt: input.endedAt,
      updatedAt: new Date(),
    })
    .where(eq(callJobs.id, job.id));
}

/**
 * Records one finalized utterance. Duplicate provider deliveries collapse on
 * the attempt+fingerprint index, so a replayed callback cannot double a line.
 */
export async function appendCallTranscriptLine(
  db: AppDatabase,
  input: {
    attemptId: string;
    jobId: string;
    workspaceId: string;
    speaker: CallTranscriptSpeaker;
    textCiphertext: string;
    fingerprint: string;
    spokenAt: Date;
  },
): Promise<void> {
  await db
    .insert(callTranscriptLines)
    .values({
      id: createId("clt"),
      attemptId: input.attemptId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      speaker: input.speaker,
      textCiphertext: input.textCiphertext,
      fingerprint: input.fingerprint,
      spokenAt: input.spokenAt,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        callTranscriptLines.attemptId,
        callTranscriptLines.fingerprint,
      ],
    });
}

export async function listCallTranscriptLines(
  db: AppDatabase,
  attemptIds: string[],
) {
  if (attemptIds.length === 0) return [];
  return db
    .select({
      attemptId: callTranscriptLines.attemptId,
      speaker: callTranscriptLines.speaker,
      textCiphertext: callTranscriptLines.textCiphertext,
      spokenAt: callTranscriptLines.spokenAt,
      createdAt: callTranscriptLines.createdAt,
    })
    .from(callTranscriptLines)
    .where(inArray(callTranscriptLines.attemptId, attemptIds))
    .orderBy(
      asc(callTranscriptLines.spokenAt),
      asc(callTranscriptLines.createdAt),
    );
}

export async function purgeCallTranscript(
  db: AppDatabase,
  attemptId: string,
): Promise<void> {
  await db
    .delete(callTranscriptLines)
    .where(eq(callTranscriptLines.attemptId, attemptId));
}

/**
 * Safety net for a lost end-of-call callback: drop lines whose attempt is no
 * longer live, and any line older than the retention ceiling regardless of
 * attempt state. Runs on the minute cron so a stalled call cannot leave a
 * transcript behind indefinitely.
 */
export async function purgeStaleCallTranscripts(
  db: AppDatabase,
  now = new Date(),
  maximumAgeMinutes = 60,
): Promise<void> {
  const liveAttempts = await db
    .select({ id: callAttempts.id })
    .from(callAttempts)
    .where(inArray(callAttempts.status, [...ACTIVE_CALL_ATTEMPT_STATUSES]));
  const liveIds = liveAttempts.map((attempt) => attempt.id);

  if (liveIds.length === 0) {
    await db.delete(callTranscriptLines);
    return;
  }

  await db
    .delete(callTranscriptLines)
    .where(notInArray(callTranscriptLines.attemptId, liveIds));
  // A call wedged in a live state still loses its transcript at the ceiling.
  await db
    .delete(callTranscriptLines)
    .where(
      lt(
        callTranscriptLines.createdAt,
        new Date(now.getTime() - maximumAgeMinutes * 60_000),
      ),
    );
}

/**
 * Attempts the provider still holds, newest first, with the job fields the
 * operator console needs to name the call.
 */
export async function listActiveCallAttempts(db: AppDatabase, limit = 20) {
  return db
    .select({
      attemptId: callAttempts.id,
      jobId: callAttempts.jobId,
      workspaceId: callAttempts.workspaceId,
      attemptNumber: callAttempts.attemptNumber,
      attemptStatus: callAttempts.status,
      scheduledAt: callAttempts.scheduledAt,
      startedAt: callAttempts.startedAt,
      jobStatus: callJobs.status,
      maxAttempts: callJobs.maxAttempts,
      attemptCount: callJobs.attemptCount,
      recipientDataCiphertext: callJobs.recipientDataCiphertext,
      recipientPhoneLast4: callJobs.recipientPhoneLast4,
    })
    .from(callAttempts)
    .innerJoin(callJobs, eq(callJobs.id, callAttempts.jobId))
    .where(inArray(callAttempts.status, [...ACTIVE_CALL_ATTEMPT_STATUSES]))
    .orderBy(desc(callAttempts.scheduledAt))
    .limit(limit);
}

/** Attempts waiting on the cron or the queue, oldest scheduled first. */
export async function listPendingCallAttempts(db: AppDatabase, limit = 50) {
  return db
    .select({
      attemptId: callAttempts.id,
      jobId: callAttempts.jobId,
      attemptNumber: callAttempts.attemptNumber,
      scheduledAt: callAttempts.scheduledAt,
      recipientDataCiphertext: callJobs.recipientDataCiphertext,
      recipientPhoneLast4: callJobs.recipientPhoneLast4,
      maxAttempts: callJobs.maxAttempts,
    })
    .from(callAttempts)
    .innerJoin(callJobs, eq(callJobs.id, callAttempts.jobId))
    .where(eq(callAttempts.status, "scheduled"))
    .orderBy(asc(callAttempts.scheduledAt))
    .limit(limit);
}

export async function listCallLogs(db: AppDatabase, limit = 100) {
  const jobs = await db
    .select()
    .from(callJobs)
    .orderBy(desc(callJobs.createdAt))
    .limit(limit);
  if (jobs.length === 0) return [];
  const attempts = await db
    .select()
    .from(callAttempts)
    .where(inArray(callAttempts.jobId, jobs.map((job) => job.id)))
    .orderBy(asc(callAttempts.attemptNumber));
  return jobs.map((job) => ({
    job,
    attempts: attempts.filter((attempt) => attempt.jobId === job.id),
  }));
}

function nextRetryAt(endedAt: Date, attemptsCompleted: number): Date {
  const delayMinutes = attemptsCompleted <= 1 ? 15 : 4 * 60;
  return new Date(endedAt.getTime() + delayMinutes * 60_000);
}
