import { and, eq, lt } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { providerInboxEvents } from "../../db/schema";
import { createId } from "../data/ids";

export type InboxClaim =
  | { claimed: true; id: string; attempts: number }
  | {
      claimed: false;
      id: string;
      state: "processing" | "completed";
      attempts: number;
    };

export async function findProviderEvent(
  db: AppDatabase,
  provider: string,
  providerEventId: string,
) {
  return (
    (await db
      .select()
      .from(providerInboxEvents)
      .where(
        and(
          eq(providerInboxEvents.provider, provider),
          eq(providerInboxEvents.providerEventId, providerEventId),
        ),
      )
      .limit(1))[0] ?? null
  );
}

export async function claimProviderEvent(
  db: AppDatabase,
  input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    receivedAt?: Date;
  },
): Promise<InboxClaim> {
  const now = new Date();
  const [inserted] = await db
    .insert(providerInboxEvents)
    .values({
      id: createId("inb"),
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      state: "processing",
      attempts: 1,
      receivedAt: input.receivedAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        providerInboxEvents.provider,
        providerInboxEvents.providerEventId,
      ],
    })
    .returning();

  if (inserted) {
    return { claimed: true, id: inserted.id, attempts: inserted.attempts };
  }

  const existing = await findProviderEvent(
    db,
    input.provider,
    input.providerEventId,
  );
  if (!existing) {
    throw new Error("Inbox conflict occurred without a readable event");
  }

  if (existing.state === "failed") {
    const [reclaimed] = await db
      .update(providerInboxEvents)
      .set({
        state: "processing",
        attempts: existing.attempts + 1,
        lastError: null,
        processedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(providerInboxEvents.id, existing.id),
          eq(providerInboxEvents.state, "failed"),
        ),
      )
      .returning();
    if (reclaimed) {
      return {
        claimed: true,
        id: reclaimed.id,
        attempts: reclaimed.attempts,
      };
    }
  }

  return {
    claimed: false,
    id: existing.id,
    state: existing.state === "completed" ? "completed" : "processing",
    attempts: existing.attempts,
  };
}

export async function completeProviderEvent(
  db: AppDatabase,
  inboxEventId: string,
): Promise<boolean> {
  const now = new Date();
  const [completed] = await db
    .update(providerInboxEvents)
    .set({ state: "completed", processedAt: now, updatedAt: now })
    .where(
      and(
        eq(providerInboxEvents.id, inboxEventId),
        eq(providerInboxEvents.state, "processing"),
      ),
    )
    .returning({ id: providerInboxEvents.id });
  return Boolean(completed);
}

export async function failProviderEvent(
  db: AppDatabase,
  inboxEventId: string,
  error: unknown,
): Promise<boolean> {
  const now = new Date();
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const [failed] = await db
    .update(providerInboxEvents)
    .set({
      state: "failed",
      lastError: message.slice(0, 2_000),
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(providerInboxEvents.id, inboxEventId),
        eq(providerInboxEvents.state, "processing"),
      ),
    )
    .returning({ id: providerInboxEvents.id });
  return Boolean(failed);
}

export async function failStaleProviderEvents(
  db: AppDatabase,
  olderThan: Date,
): Promise<number> {
  const now = new Date();
  const rows = await db
    .update(providerInboxEvents)
    .set({
      state: "failed",
      lastError: "Processing lease expired",
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(providerInboxEvents.state, "processing"),
        lt(providerInboxEvents.updatedAt, olderThan),
      ),
    )
    .returning({ id: providerInboxEvents.id });
  return rows.length;
}
