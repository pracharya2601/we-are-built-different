import { and, eq, inArray, lte, sql } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { outboxEvents } from "../../db/schema";
import { createId } from "../data/ids";

export async function enqueueOutboxEvent(
  db: AppDatabase,
  input: {
    id?: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    schemaVersion?: number;
    payload: Record<string, unknown>;
    availableAt?: Date;
  },
) {
  const now = new Date();
  const [event] = await db
    .insert(outboxEvents)
    .values({
      id: input.id ?? createId("evt"),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      schemaVersion: input.schemaVersion ?? 1,
      payload: input.payload,
      availableAt: input.availableAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outboxEvents.id })
    .returning();
  return event ?? null;
}

export async function claimOutboxBatch(
  db: AppDatabase,
  options: {
    limit?: number;
    leaseMs?: number;
    now?: Date;
    eventTypes?: string[];
  } = {},
) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const leaseMs = Math.max(options.leaseMs ?? 30_000, 5_000);
  const eventTypeCondition =
    options.eventTypes && options.eventTypes.length > 0
      ? inArray(outboxEvents.eventType, options.eventTypes)
      : undefined;
  const candidates = await db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(
      and(
        inArray(outboxEvents.state, ["pending", "failed"]),
        lte(outboxEvents.availableAt, now),
        eventTypeCondition,
      ),
    )
    .orderBy(outboxEvents.availableAt, outboxEvents.createdAt)
    .limit(limit);

  if (candidates.length === 0) return [];

  const leaseToken = createId("lease");
  const lockedUntil = new Date(now.getTime() + leaseMs);
  await db
    .update(outboxEvents)
    .set({
      state: "processing",
      attempts: sql`${outboxEvents.attempts} + 1`,
      leaseToken,
      lockedUntil,
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          outboxEvents.id,
          candidates.map((candidate) => candidate.id),
        ),
        inArray(outboxEvents.state, ["pending", "failed"]),
      ),
    );

  return db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.leaseToken, leaseToken));
}

export async function markOutboxPublished(
  db: AppDatabase,
  eventId: string,
  leaseToken: string,
): Promise<boolean> {
  const now = new Date();
  const [published] = await db
    .update(outboxEvents)
    .set({
      state: "published",
      publishedAt: now,
      leaseToken: null,
      lockedUntil: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.state, "processing"),
        eq(outboxEvents.leaseToken, leaseToken),
      ),
    )
    .returning({ id: outboxEvents.id });
  return Boolean(published);
}

export async function markOutboxFailed(
  db: AppDatabase,
  eventId: string,
  leaseToken: string,
  error: unknown,
  retryAt: Date,
): Promise<boolean> {
  const now = new Date();
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const [failed] = await db
    .update(outboxEvents)
    .set({
      state: "failed",
      availableAt: retryAt,
      leaseToken: null,
      lockedUntil: null,
      lastError: message.slice(0, 2_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.state, "processing"),
        eq(outboxEvents.leaseToken, leaseToken),
      ),
    )
    .returning({ id: outboxEvents.id });
  return Boolean(failed);
}

export async function releaseExpiredOutboxLeases(
  db: AppDatabase,
  now = new Date(),
): Promise<number> {
  const released = await db
    .update(outboxEvents)
    .set({
      state: "failed",
      leaseToken: null,
      lockedUntil: null,
      availableAt: now,
      lastError: "Publish lease expired",
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.state, "processing"),
        lte(outboxEvents.lockedUntil, now),
      ),
    )
    .returning({ id: outboxEvents.id });
  return released.length;
}
