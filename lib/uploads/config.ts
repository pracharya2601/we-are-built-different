import { env } from "cloudflare:workers";

import type {
  FileMetadataDeliveryConfig,
  ImageUploadConfig,
} from "./types";

type UploadEnv = Partial<{
  APP_ENV: string;
  IMAGE_UPLOADS: R2Bucket;
  IMAGE_UPLOADS_BUCKET_NAME: string;
  IMAGE_UPLOAD_MAX_BYTES: string;
  FILE_METADATA_SERVICE_URL: string;
  FILE_METADATA_SERVICE_TOKEN: string;
}>;

export class UploadConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadConfigurationError";
  }
}

export function getImageUploadConfig(
  runtimeEnv: UploadEnv = env,
): ImageUploadConfig {
  const bucketName = required(
    runtimeEnv.IMAGE_UPLOADS_BUCKET_NAME,
    "IMAGE_UPLOADS_BUCKET_NAME",
  );
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucketName)) {
    throw new UploadConfigurationError(
      "IMAGE_UPLOADS_BUCKET_NAME must be a valid Cloudflare R2 bucket name.",
    );
  }

  return {
    bucketName,
    maxImageBytes: boundedInteger(
      runtimeEnv.IMAGE_UPLOAD_MAX_BYTES,
      10 * 1024 * 1024,
      1,
      100 * 1024 * 1024,
      "IMAGE_UPLOAD_MAX_BYTES",
    ),
  };
}

export function getImageUploadBucket(
  runtimeEnv: UploadEnv = env,
): R2Bucket {
  if (!runtimeEnv.IMAGE_UPLOADS) {
    throw new UploadConfigurationError(
      "Cloudflare R2 binding IMAGE_UPLOADS is required before image uploads can be used.",
    );
  }
  return runtimeEnv.IMAGE_UPLOADS;
}

export function getFileMetadataDeliveryConfig(
  runtimeEnv: UploadEnv = env,
): FileMetadataDeliveryConfig | null {
  const url = clean(runtimeEnv.FILE_METADATA_SERVICE_URL);
  const token = clean(runtimeEnv.FILE_METADATA_SERVICE_TOKEN);
  if (!url && !token) return null;
  if (!url || !token) {
    throw new UploadConfigurationError(
      "FILE_METADATA_SERVICE_URL and FILE_METADATA_SERVICE_TOKEN must be configured together.",
    );
  }
  const parsedUrl = parseUrl(url, "FILE_METADATA_SERVICE_URL");
  if (
    parsedUrl.protocol !== "https:" &&
    !(
      runtimeEnv.APP_ENV === "development" &&
      ["localhost", "127.0.0.1"].includes(parsedUrl.hostname)
    )
  ) {
    throw new UploadConfigurationError(
      "FILE_METADATA_SERVICE_URL must use HTTPS outside local development.",
    );
  }
  return { url: parsedUrl.toString(), token };
}

function required(value: string | undefined, name: string): string {
  const result = clean(value);
  if (!result) {
    throw new UploadConfigurationError(
      `${name} is required before image uploads can be used.`,
    );
  }
  return result;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parseUrl(value: string, name: string): URL {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url;
  } catch {
    throw new UploadConfigurationError(`${name} must be a valid HTTP URL.`);
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!clean(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new UploadConfigurationError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}
