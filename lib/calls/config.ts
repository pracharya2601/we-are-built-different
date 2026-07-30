import type {
  CallQueue,
  VapiCallConfiguration,
} from "./types";

type CallEnvironment = {
  CALL_AUTOMATION_QUEUE?: CallQueue;
  CALL_DATA_ENCRYPTION_KEY?: string;
  VAPI_API_KEY?: string;
  VAPI_ASSISTANT_ID?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_WEBHOOK_TOKEN?: string;
  VAPI_API_BASE_URL?: string;
};

export class CallConfigurationError extends Error {
  readonly missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "CallConfigurationError";
    this.missing = missing;
  }
}

export function getCallQueue(environment: CallEnvironment): CallQueue {
  if (!environment.CALL_AUTOMATION_QUEUE) {
    throw new CallConfigurationError(
      "The CALL_AUTOMATION_QUEUE binding is unavailable.",
      ["CALL_AUTOMATION_QUEUE"],
    );
  }
  return environment.CALL_AUTOMATION_QUEUE;
}

export function getCallDataEncryptionKey(
  environment: CallEnvironment,
): string {
  const value = environment.CALL_DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (value.length < 32) {
    throw new CallConfigurationError(
      "CALL_DATA_ENCRYPTION_KEY must contain at least 32 characters.",
      ["CALL_DATA_ENCRYPTION_KEY"],
    );
  }
  return value;
}

export function getVapiCallConfiguration(
  environment: CallEnvironment,
): VapiCallConfiguration {
  const required = {
    VAPI_API_KEY: environment.VAPI_API_KEY,
    VAPI_ASSISTANT_ID: environment.VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID: environment.VAPI_PHONE_NUMBER_ID,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new CallConfigurationError(
      `Vapi call automation is missing: ${missing.join(", ")}.`,
      missing,
    );
  }

  const apiBaseUrl =
    environment.VAPI_API_BASE_URL?.trim() || "https://api.vapi.ai";
  const parsed = new URL(apiBaseUrl);
  if (parsed.protocol !== "https:") {
    throw new CallConfigurationError(
      "VAPI_API_BASE_URL must use HTTPS.",
      ["VAPI_API_BASE_URL"],
    );
  }

  return {
    apiKey: required.VAPI_API_KEY!.trim(),
    assistantId: required.VAPI_ASSISTANT_ID!.trim(),
    phoneNumberId: required.VAPI_PHONE_NUMBER_ID!.trim(),
    apiBaseUrl: parsed.origin,
  };
}

export function getVapiWebhookToken(
  environment: CallEnvironment,
): string {
  const value = environment.VAPI_WEBHOOK_TOKEN?.trim() ?? "";
  if (value.length < 24) {
    throw new CallConfigurationError(
      "VAPI_WEBHOOK_TOKEN must contain at least 24 characters.",
      ["VAPI_WEBHOOK_TOKEN"],
    );
  }
  return value;
}
