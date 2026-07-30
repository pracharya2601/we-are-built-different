/** Cloudflare Worker entry point for the vinext-starter template. */
import { drizzle } from "drizzle-orm/d1";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

import * as schema from "../db/schema";
import {
  deliverImageMetadataEvents,
  getFileMetadataDeliveryConfig,
} from "../lib/uploads";
import {
  dispatchDueCallAttempts,
  processCallQueueMessage,
  purgeStaleCallTranscripts,
  type CallQueueMessage,
} from "../lib/calls";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGE_UPLOADS: R2Bucket;
  IMAGE_UPLOADS_BUCKET_NAME?: string;
  APP_ENV?: string;
  FILE_METADATA_SERVICE_URL?: string;
  FILE_METADATA_SERVICE_TOKEN?: string;
  CALL_AUTOMATION_QUEUE: Queue<CallQueueMessage>;
  CALL_DATA_ENCRYPTION_KEY?: string;
  VAPI_API_KEY?: string;
  VAPI_ASSISTANT_ID?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_WEBHOOK_TOKEN?: string;
  VAPI_API_BASE_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const db = drizzle(env.DB, { schema });
    const tasks: Promise<unknown>[] = [
      dispatchDueCallAttempts(db, env.CALL_AUTOMATION_QUEUE),
      // Live transcripts belong to calls in progress; a lost end-of-call
      // callback must not leave one behind.
      purgeStaleCallTranscripts(db),
    ];
    const config = getFileMetadataDeliveryConfig(env);
    if (config) tasks.push(deliverImageMetadataEvents(db, config));
    ctx.waitUntil(Promise.all(tasks));
  },
  async queue(
    batch: MessageBatch<CallQueueMessage>,
    env: Env,
  ): Promise<void> {
    const db = drizzle(env.DB, { schema });
    for (const message of batch.messages) {
      try {
        await processCallQueueMessage(db, env, message.body);
        message.ack();
      } catch (error) {
        console.error("Call queue message could not be processed", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        message.retry({ delaySeconds: 60 });
      }
    }
  },
};

export default worker;
