import { env } from "cloudflare:workers";

import type { CallQueue } from "./types";

export type CallRuntimeEnvironment = {
  CALL_AUTOMATION_QUEUE?: CallQueue;
  CALL_DATA_ENCRYPTION_KEY?: string;
  VAPI_API_KEY?: string;
  VAPI_ASSISTANT_ID?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_WEBHOOK_TOKEN?: string;
  VAPI_API_BASE_URL?: string;
};

export function getCallRuntimeEnvironment(): CallRuntimeEnvironment {
  return env as unknown as CallRuntimeEnvironment;
}
