import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import { createId } from "@/lib/data";
import {
  buildImageObjectKey,
  createPendingImageUpload,
  getImageUploadBucket,
  getImageUploadConfig,
  hasImageUploadAccess,
  parseImageUploadRequest,
  UploadConfigurationError,
  UploadValidationError,
} from "@/lib/uploads";

export const POST = withApiAuth(
  async function requestImageUpload(request, _context, auth) {
    try {
      const db = getDb();
      if (!(await hasImageUploadAccess(db, auth))) {
        return apiError(
          "active_entitlement_required",
          "An active workspace entitlement is required to upload images.",
          403,
        );
      }
      const config = getImageUploadConfig();
      void getImageUploadBucket();
      const body = await readJson(request);
      const input = parseImageUploadRequest(body, config.maxImageBytes);
      const uploadId = createId("upl");
      const objectKey = buildImageObjectKey(
        auth.workspaceId,
        uploadId,
        input.contentType,
      );
      const upload = await createPendingImageUpload(db, {
        ...input,
        id: uploadId,
        workspaceId: auth.workspaceId,
        createdByUserId: auth.userId,
        bucket: config.bucketName,
        objectKey,
      });
      const uploadUrl = new URL(
        `/api/v1/uploads/images/${upload.id}/content`,
        request.url,
      ).toString();

      return Response.json(
        {
          upload: {
            id: upload.id,
            workspaceId: upload.workspaceId,
            objectKey: upload.objectKey,
            contentType: upload.contentType,
            sizeBytes: upload.declaredSizeBytes,
            status: upload.status,
          },
          request: {
            method: "PUT",
            url: uploadUrl,
            headers: {
              "content-type": upload.contentType,
            },
          },
        },
        {
          status: 201,
          headers: { "cache-control": "private, no-store" },
        },
      );
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return apiError(error.code, error.message, 400);
      }
      if (error instanceof UploadConfigurationError) {
        return apiError("upload_not_configured", error.message, 503);
      }
      throw error;
    }
  },
  "product:use",
);

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new UploadValidationError(
      "invalid_json",
      "Request body must contain valid JSON.",
    );
  }
}

function apiError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
