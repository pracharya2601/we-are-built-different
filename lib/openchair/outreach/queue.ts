import type { OutreachQueueMessage } from "./types.ts";

export interface OutreachQueue {
  send(message: OutreachQueueMessage): Promise<void>;
}
