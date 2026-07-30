import {
  IMAGE_CONTENT_TYPES,
  type ImageContentType,
  type ImageUploadRequest,
} from "./types.ts";

const ALLOWED_CONTENT_TYPES = new Set<string>(IMAGE_CONTENT_TYPES);
const EXTENSIONS: Record<ImageContentType, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class UploadValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UploadValidationError";
    this.code = code;
  }
}

export function parseImageUploadRequest(
  value: unknown,
  maxImageBytes: number,
): ImageUploadRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UploadValidationError(
      "invalid_request",
      "Request body must be a JSON object.",
    );
  }
  const input = value as Record<string, unknown>;
  const filename =
    typeof input.filename === "string" ? input.filename.trim() : "";
  const contentType =
    typeof input.contentType === "string"
      ? input.contentType.trim().toLowerCase()
      : "";
  const sizeBytes = input.sizeBytes;

  if (
    !filename ||
    filename.length > 255 ||
    /[\u0000-\u001f\u007f]/u.test(filename)
  ) {
    throw new UploadValidationError(
      "invalid_filename",
      "filename must contain 1 to 255 printable characters.",
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new UploadValidationError(
      "unsupported_image_type",
      `contentType must be one of: ${IMAGE_CONTENT_TYPES.join(", ")}.`,
    );
  }
  if (
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maxImageBytes
  ) {
    throw new UploadValidationError(
      "invalid_image_size",
      `sizeBytes must be a positive integer no larger than ${maxImageBytes}.`,
    );
  }
  return {
    filename,
    contentType: contentType as ImageContentType,
    sizeBytes,
  };
}

export function buildImageObjectKey(
  workspaceId: string,
  uploadId: string,
  contentType: ImageContentType,
): string {
  return `workspaces/${workspaceId}/images/${uploadId}.${EXTENSIONS[contentType]}`;
}

export function validateImageContent(
  contentType: ImageContentType,
  body: ArrayBuffer,
): void {
  const bytes = new Uint8Array(body);
  const valid =
    contentType === "image/png"
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : contentType === "image/jpeg"
        ? startsWith(bytes, [0xff, 0xd8, 0xff])
        : contentType === "image/gif"
          ? ascii(bytes, 0, 6) === "GIF87a" ||
            ascii(bytes, 0, 6) === "GIF89a"
          : contentType === "image/webp"
            ? ascii(bytes, 0, 4) === "RIFF" &&
              ascii(bytes, 8, 4) === "WEBP"
            : contentType === "image/avif"
              ? isAvif(bytes)
              : false;
  if (!valid) {
    throw new UploadValidationError(
      "invalid_image_content",
      "Uploaded bytes do not match the declared image content type.",
    );
  }
}

export function storedImageMetadataMismatch(
  upload: {
    id: string;
    workspaceId: string;
    contentType: string;
    declaredSizeBytes: number;
  },
  metadata: {
    uploadId: string | null;
    workspaceId: string | null;
    contentType: string;
    sizeBytes: number;
  },
): string | null {
  if (metadata.uploadId !== upload.id) {
    return "Stored object upload metadata does not match this upload.";
  }
  if (metadata.workspaceId !== upload.workspaceId) {
    return "Stored object workspace metadata does not match this workspace.";
  }
  if (metadata.contentType !== upload.contentType) {
    return "Stored object content type does not match the upload request.";
  }
  if (metadata.sizeBytes !== upload.declaredSizeBytes) {
    return "Stored object size does not match the upload request.";
  }
  return null;
}

function isAvif(bytes: Uint8Array): boolean {
  if (ascii(bytes, 4, 4) !== "ftyp") return false;
  for (let offset = 8; offset + 4 <= Math.min(bytes.length, 40); offset += 4) {
    const brand = ascii(bytes, offset, 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  return (
    bytes.length >= expected.length &&
    expected.every((byte, index) => bytes[index] === byte)
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
