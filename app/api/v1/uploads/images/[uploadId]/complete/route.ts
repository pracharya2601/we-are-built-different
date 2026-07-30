import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  completeWorkspaceImageUpload,
  getImageUploadBucket,
  getImageUploadConfig,
  getWorkspaceImageUpload,
  hasImageUploadAccess,
  inspectImageInR2,
  R2StorageError,
  storedImageMetadataMismatch,
  UploadConfigurationError,
} from "@/lib/uploads";

export const POST = withApiAuth(
  async function completeImageUpload(
    _request,
    context: { params: Promise<{ uploadId: string }> },
    auth,
  ) {
    const { uploadId } = await context.params;
    if (!/^upl_[a-f0-9]{32}$/u.test(uploadId)) {
      return apiError("upload_not_found", "Image upload was not found.", 404);
    }

    const db = getDb();
    if (!(await hasImageUploadAccess(db, auth))) {
      return apiError(
        "active_entitlement_required",
        "An active workspace entitlement is required to complete image uploads.",
        403,
      );
    }
    const upload = await getWorkspaceImageUpload(
      db,
      auth.workspaceId,
      uploadId,
    );
    if (!upload) {
      return apiError("upload_not_found", "Image upload was not found.", 404);
    }
    if (upload.status === "completed") {
      return completedResponse(upload);
    }
    if (upload.status !== "pending") {
      return apiError(
        "upload_not_pending",
        "Image upload cannot be completed from its current state.",
        409,
      );
    }

    try {
      const config = getImageUploadConfig();
      const bucket = getImageUploadBucket();
      if (
        config.bucketName !== upload.bucket ||
        upload.provider !== "r2"
      ) {
        throw new UploadConfigurationError(
          "The R2 binding does not match the storage recorded for this upload.",
        );
      }
      const metadata = await inspectImageInR2(bucket, upload.objectKey);
      const mismatch = storedImageMetadataMismatch(upload, metadata);
      if (mismatch) {
        return apiError("uploaded_object_mismatch", mismatch, 409);
      }
      await completeWorkspaceImageUpload(db, {
        uploadId: upload.id,
        workspaceId: upload.workspaceId,
        bucket: upload.bucket,
        objectKey: upload.objectKey,
        createdByUserId: upload.createdByUserId,
        completedByUserId: auth.userId,
        contentType: upload.contentType,
        metadata,
      });
      const completed = await getWorkspaceImageUpload(
        db,
        auth.workspaceId,
        uploadId,
      );
      if (!completed || completed.status !== "completed") {
        return apiError(
          "upload_completion_conflict",
          "Image upload completion conflicted with another request.",
          409,
        );
      }
      return completedResponse(completed);
    } catch (error) {
      if (error instanceof UploadConfigurationError) {
        return apiError("upload_not_configured", error.message, 503);
      }
      if (error instanceof R2StorageError) {
        return apiError(error.code, error.message, error.status);
      }
      throw error;
    }
  },
  "product:use",
);

function completedResponse(upload: {
  id: string;
  workspaceId: string;
  objectKey: string;
  contentType: string;
  storedSizeBytes: number | null;
  etag: string | null;
  versionId: string | null;
  status: string;
  completedAt: Date | null;
}): Response {
  return Response.json(
    {
      upload: {
        id: upload.id,
        workspaceId: upload.workspaceId,
        objectKey: upload.objectKey,
        contentType: upload.contentType,
        sizeBytes: upload.storedSizeBytes,
        etag: upload.etag,
        versionId: upload.versionId,
        status: upload.status,
        completedAt: upload.completedAt?.toISOString() ?? null,
      },
      metadataDelivery: { queued: true },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

function apiError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
