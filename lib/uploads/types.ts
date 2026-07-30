export const IMAGE_CONTENT_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export type ImageUploadConfig = {
  bucketName: string;
  maxImageBytes: number;
};

export type FileMetadataDeliveryConfig = {
  url: string;
  token: string;
};

export type ImageUploadRequest = {
  filename: string;
  contentType: ImageContentType;
  sizeBytes: number;
};

export type StoredObjectMetadata = {
  etag: string;
  versionId: string;
  contentType: string;
  sizeBytes: number;
  uploadId: string | null;
  workspaceId: string | null;
};
