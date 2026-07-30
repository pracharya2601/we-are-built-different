import type { AppDatabase } from "../../db";
import { auditLog } from "../../db/schema";
import { createId } from "./ids";

export async function appendAuditLog(
  db: AppDatabase,
  input: {
    workspaceId?: string | null;
    actorType: "user" | "service" | "system";
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    requestId?: string | null;
    ipAddress?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  const [entry] = await db
    .insert(auditLog)
    .values({
      id: createId("aud"),
      workspaceId: input.workspaceId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();
  return entry;
}

