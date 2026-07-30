import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  auditLog,
  imageUploads,
  outboxEvents,
} from "../../db/schema";
import type { ImageUploadRequest, StoredObjectMetadata } from "./types";

export async function createPendingImageUpload(
  db: AppDatabase,
  input: ImageUploadRequest & {
    id: string;
    workspaceId: string;
    createdByUserId: string;
    bucket: string;
    objectKey: string;
  },
) {
  const now = new Date();
  const [upload] = await db
    .insert(imageUploads)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      provider: "r2",
      bucket: input.bucket,
      objectKey: input.objectKey,
      originalFilename: input.filename,
      contentType: input.contentType,
      declaredSizeBytes: input.sizeBytes,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return upload;
}

export async function getWorkspaceImageUpload(
  db: AppDatabase,
  workspaceId: string,
  uploadId: string,
) {
  const [upload] = await db
    .select()
    .from(imageUploads)
    .where(
      and(
        eq(imageUploads.id, uploadId),
        eq(imageUploads.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return upload ?? null;
}

export async function completeWorkspaceImageUpload(
  db: AppDatabase,
  input: {
    uploadId: string;
    workspaceId: string;
    bucket: string;
    objectKey: string;
    createdByUserId: string;
    completedByUserId: string;
    contentType: string;
    metadata: StoredObjectMetadata;
  },
): Promise<boolean> {
  const now = new Date();
  const eventId = eventIdForUpload(input.uploadId);
  const updateMutation = db
    .update(imageUploads)
    .set({
      status: "completed",
      storedSizeBytes: input.metadata.sizeBytes,
      etag: input.metadata.etag || null,
      versionId: input.metadata.versionId,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(imageUploads.id, input.uploadId),
        eq(imageUploads.workspaceId, input.workspaceId),
        eq(imageUploads.status, "pending"),
      ),
    )
    .returning({ id: imageUploads.id });
  const eventMutation = db
    .insert(outboxEvents)
    .values({
      id: eventId,
      aggregateType: "image_upload",
      aggregateId: input.uploadId,
      eventType: "image.upload.completed.v1",
      schemaVersion: 1,
      payload: {
        eventId,
        uploadId: input.uploadId,
        workspaceId: input.workspaceId,
        provider: "cloudflare_r2",
        bucket: input.bucket,
        objectKey: input.objectKey,
        etag: input.metadata.etag || null,
        versionId: input.metadata.versionId,
        contentType: input.contentType,
        sizeBytes: input.metadata.sizeBytes,
        createdByUserId: input.createdByUserId,
        completedAt: now.toISOString(),
      },
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outboxEvents.id })
    .returning({ id: outboxEvents.id });
  const auditMutation = db
    .insert(auditLog)
    .values({
      id: auditIdForUpload(input.uploadId),
      workspaceId: input.workspaceId,
      actorType: "user",
      actorId: input.completedByUserId,
      action: "image_upload.completed",
      targetType: "image_upload",
      targetId: input.uploadId,
      metadata: {
        contentType: input.contentType,
        sizeBytes: input.metadata.sizeBytes,
        versionId: input.metadata.versionId,
      },
      occurredAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: auditLog.id })
    .returning({ id: auditLog.id });

  const [updated] = await db.batch([
    updateMutation,
    eventMutation,
    auditMutation,
  ]);
  return updated.length === 1;
}

export function auditIdForUpload(uploadId: string): string {
  return `aud_${uploadId.replace(/^upl_/u, "")}`;
}

export function eventIdForUpload(uploadId: string): string {
  return `evt_${uploadId.replace(/^upl_/u, "")}`;
}
