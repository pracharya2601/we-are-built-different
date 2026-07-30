declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGES: ImagesBinding;
    IMAGE_UPLOADS: R2Bucket;
    CALL_AUTOMATION_QUEUE: Queue<import("./lib/calls/types").CallQueueMessage>;
    APP_ENV?: string;
    IMAGE_UPLOADS_BUCKET_NAME?: string;
    IMAGE_UPLOAD_MAX_BYTES?: string;
    FILE_METADATA_SERVICE_URL?: string;
    FILE_METADATA_SERVICE_TOKEN?: string;
    CALL_DATA_ENCRYPTION_KEY?: string;
    VAPI_API_KEY?: string;
    VAPI_ASSISTANT_ID?: string;
    VAPI_PHONE_NUMBER_ID?: string;
    VAPI_WEBHOOK_TOKEN?: string;
    VAPI_API_BASE_URL?: string;
  }
}
