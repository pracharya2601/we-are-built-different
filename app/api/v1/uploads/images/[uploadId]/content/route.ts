import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  completeWorkspaceImageUpload,
  getImageUploadBucket,
  getImageUploadConfig,
  getWorkspaceImageUpload,
  hasImageUploadAccess,
  putImageInR2,
  R2StorageError,
  storedImageMetadataMismatch,
  UploadConfigurationError,
  UploadValidationError,
  validateImageContent,
  type ImageContentType,
} from "@/lib/uploads";

export const PUT = withApiAuth(
  async function uploadImageContent(
    request,
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
        "An active workspace entitlement is required to upload images.",
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
    if (upload.status === "completed") return completedResponse(upload);
    if (upload.status !== "pending") {
      return apiError(
        "upload_not_pending",
        "Image upload cannot accept content from its current state.",
        409,
      );
    }

    try {
      const config = getImageUploadConfig();
      const bucket = getImageUploadBucket();
      if (upload.bucket !== config.bucketName || upload.provider !== "r2") {
        throw new UploadConfigurationError(
          "The R2 binding does not match the storage recorded for this upload.",
        );
      }
      const contentType =
        request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
      if (contentType !== upload.contentType) {
        return apiError(
          "uploaded_content_type_mismatch",
          "Request Content-Type does not match the upload intent.",
          409,
        );
      }
      const contentLength = parseContentLength(request);
      if (contentLength !== upload.declaredSizeBytes) {
        return apiError(
          "uploaded_size_mismatch",
          "Request Content-Length does not match the upload intent.",
          409,
        );
      }
      if (contentLength > config.maxImageBytes) {
        return apiError(
          "image_too_large",
          "Image exceeds the configured upload limit.",
          413,
        );
      }
      const body = await request.arrayBuffer();
      if (body.byteLength !== upload.declaredSizeBytes) {
        return apiError(
          "uploaded_size_mismatch",
          "Uploaded bytes do not match the declared image size.",
          409,
        );
      }
      validateImageContent(upload.contentType as ImageContentType, body);
      const metadata = await putImageInR2(bucket, {
        objectKey: upload.objectKey,
        body,
        contentType: upload.contentType,
        uploadId: upload.id,
        workspaceId: upload.workspaceId,
      });
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
        upload.id,
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
      if (error instanceof UploadValidationError) {
        return apiError(error.code, error.message, 400);
      }
      if (error instanceof R2StorageError) {
        return apiError(error.code, error.message, error.status);
      }
      throw error;
    }
  },
  "product:use",
);

function parseContentLength(request: Request): number {
  const raw = request.headers.get("content-length");
  const value = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UploadValidationError(
      "content_length_required",
      "A valid Content-Length header is required for image uploads.",
    );
  }
  return value;
}

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
