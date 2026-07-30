import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db";
import { openchairCommandReceipts } from "../../../db/schema.ts";
import { createId } from "../../data/ids.ts";
import type { CommandActor } from "../contracts/index.ts";
import { OpenChairError } from "./errors.ts";

export type CommandReceiptClaim =
  | { status: "claimed"; receiptId: string }
  | { status: "replayed"; receiptId: string; resultVersion: number | null }
  | { status: "in_flight"; receiptId: string };

export type ClaimCommandReceiptInput = {
  workspaceId: string;
  appointmentId: string;
  commandType: string;
  idempotencyKey: string;
  requestHash: string;
  expectedVersion: number;
  correlationId: string;
  actor: CommandActor;
};

/**
 * Claims the right to run one command exactly once.
 *
 * `claimed` means this caller may proceed. `replayed` means the same command
 * already succeeded and its result should be returned without reapplying it.
 * `in_flight` means another attempt is still running; the caller must not
 * apply the command concurrently.
 *
 * Reusing an idempotency key with a different request body is rejected rather
 * than silently treated as a replay — the two requests are not the same
 * command, and returning the first one's result would lose the second.
 */
export async function claimCommandReceipt(
  db: AppDatabase,
  input: ClaimCommandReceiptInput,
): Promise<CommandReceiptClaim> {
  const now = new Date();
  const [inserted] = await db
    .insert(openchairCommandReceipts)
    .values({
      id: createId("cmd"),
      workspaceId: input.workspaceId,
      aggregateType: "appointment",
      aggregateId: input.appointmentId,
      commandType: input.commandType,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      expectedVersion: input.expectedVersion,
      status: "processing",
      correlationId: input.correlationId,
      actorType: input.actor.type,
      actorId: input.actor.id || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        openchairCommandReceipts.workspaceId,
        openchairCommandReceipts.aggregateType,
        openchairCommandReceipts.aggregateId,
        openchairCommandReceipts.idempotencyKey,
      ],
    })
    .returning();

  if (inserted) return { status: "claimed", receiptId: inserted.id };

  const existing = await findCommandReceipt(
    db,
    input.workspaceId,
    input.appointmentId,
    input.idempotencyKey,
  );
  if (!existing) {
    throw new OpenChairError(
      "command_receipt_conflict",
      "A command receipt conflict occurred without a readable receipt.",
      409,
    );
  }

  if (existing.requestHash !== input.requestHash) {
    throw new OpenChairError(
      "idempotency_key_reused",
      "This idempotency key was already used for a different command.",
      409,
    );
  }

  if (existing.status === "completed") {
    return {
      status: "replayed",
      receiptId: existing.id,
      resultVersion: existing.resultVersion,
    };
  }

  if (existing.status === "failed") {
    const [reclaimed] = await db
      .update(openchairCommandReceipts)
      .set({ status: "processing", updatedAt: now })
      .where(
        and(
          eq(openchairCommandReceipts.id, existing.id),
          eq(openchairCommandReceipts.status, "failed"),
        ),
      )
      .returning();
    if (reclaimed) return { status: "claimed", receiptId: reclaimed.id };
  }

  return { status: "in_flight", receiptId: existing.id };
}

export async function completeCommandReceipt(
  db: AppDatabase,
  receiptId: string,
  resultVersion: number,
): Promise<void> {
  const now = new Date();
  await db
    .update(openchairCommandReceipts)
    .set({
      status: "completed",
      resultVersion,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(openchairCommandReceipts.id, receiptId));
}

export async function failCommandReceipt(
  db: AppDatabase,
  receiptId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(openchairCommandReceipts)
    .set({ status: "failed", updatedAt: now })
    .where(eq(openchairCommandReceipts.id, receiptId));
}

export async function findCommandReceipt(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
  idempotencyKey: string,
) {
  return (
    (
      await db
        .select()
        .from(openchairCommandReceipts)
        .where(
          and(
            eq(openchairCommandReceipts.workspaceId, workspaceId),
            eq(openchairCommandReceipts.aggregateId, appointmentId),
            eq(openchairCommandReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

/**
 * Stable fingerprint of a command body. Object keys are sorted so that two
 * structurally identical requests hash the same regardless of property order.
 */
export async function hashCommandRequest(
  value: unknown,
): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalize(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}
