import type { StoredObjectMetadata } from "./types";

export class R2StorageError extends Error {
  readonly code: string;
  readonly status: 409 | 502;

  constructor(code: string, message: string, status: 409 | 502) {
    super(message);
    this.name = "R2StorageError";
    this.code = code;
    this.status = status;
  }
}

export async function putImageInR2(
  bucket: R2Bucket,
  input: {
    objectKey: string;
    body: ArrayBuffer;
    contentType: string;
    uploadId: string;
    workspaceId: string;
  },
): Promise<StoredObjectMetadata> {
  try {
    const existing = await bucket.head(input.objectKey);
    if (existing) return metadataFromR2Object(existing);

    const object = await bucket.put(input.objectKey, input.body, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      httpMetadata: { contentType: input.contentType },
      customMetadata: {
        uploadId: input.uploadId,
        workspaceId: input.workspaceId,
      },
    });
    if (object) return metadataFromR2Object(object);

    const racedObject = await bucket.head(input.objectKey);
    if (racedObject) return metadataFromR2Object(racedObject);
    throw new R2StorageError(
      "r2_write_conflict",
      "Cloudflare R2 rejected the conditional image write.",
      409,
    );
  } catch (error) {
    if (error instanceof R2StorageError) throw error;
    throw new R2StorageError(
      "r2_write_failed",
      "Cloudflare R2 could not store the image.",
      502,
    );
  }
}

export async function inspectImageInR2(
  bucket: R2Bucket,
  objectKey: string,
): Promise<StoredObjectMetadata> {
  try {
    const object = await bucket.head(objectKey);
    if (!object) {
      throw new R2StorageError(
        "object_not_found",
        "The uploaded image was not found in Cloudflare R2.",
        409,
      );
    }
    return metadataFromR2Object(object);
  } catch (error) {
    if (error instanceof R2StorageError) throw error;
    throw new R2StorageError(
      "r2_verification_failed",
      "Cloudflare R2 could not verify the image.",
      502,
    );
  }
}

function metadataFromR2Object(object: R2Object): StoredObjectMetadata {
  return {
    etag: object.etag,
    versionId: object.version,
    contentType: object.httpMetadata?.contentType ?? "",
    sizeBytes: object.size,
    uploadId: object.customMetadata?.uploadId ?? null,
    workspaceId: object.customMetadata?.workspaceId ?? null,
  };
}
