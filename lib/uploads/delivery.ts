import type { AppDatabase } from "../../db";
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxPublished,
  releaseExpiredOutboxLeases,
} from "../events";
import type { FileMetadataDeliveryConfig } from "./types";

const IMAGE_UPLOAD_EVENT = "image.upload.completed.v1";

export async function deliverImageMetadataEvents(
  db: AppDatabase,
  config: FileMetadataDeliveryConfig,
  options: {
    fetcher?: typeof fetch;
    limit?: number;
    now?: Date;
  } = {},
): Promise<{ claimed: number; published: number; failed: number }> {
  const now = options.now ?? new Date();
  await releaseExpiredOutboxLeases(db, now);
  const events = await claimOutboxBatch(db, {
    limit: options.limit ?? 10,
    leaseMs: 30_000,
    now,
    eventTypes: [IMAGE_UPLOAD_EVENT],
  });
  const results = await Promise.all(events.map(async (event) => {
    if (!event.leaseToken) return "unchanged";
    try {
      const response = await (options.fetcher ?? fetch)(config.url, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "idempotency-key": event.id,
          "x-event-type": event.eventType,
        },
        body: JSON.stringify({
          id: event.id,
          type: event.eventType,
          schemaVersion: event.schemaVersion,
          occurredAt: event.createdAt.toISOString(),
          data: event.payload,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Metadata service returned HTTP ${response.status}.`,
        );
      }
      if (await markOutboxPublished(db, event.id, event.leaseToken)) {
        return "published";
      }
    } catch (error) {
      const retryAt = new Date(
        now.getTime() + retryDelayMs(event.attempts),
      );
      if (
        await markOutboxFailed(
          db,
          event.id,
          event.leaseToken,
          error,
          retryAt,
        )
      ) {
        return "failed";
      }
    }
    return "unchanged";
  }));

  return {
    claimed: events.length,
    published: results.filter((result) => result === "published").length,
    failed: results.filter((result) => result === "failed").length,
  };
}

function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}
