import { getDb } from "@/db";
import {
  CallConfigurationError,
  getCallDataEncryptionKey,
  getCallRuntimeEnvironment,
  getVapiWebhookToken,
  handleVapiWebhook,
  VapiWebhookError,
} from "@/lib/calls";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const environment = getCallRuntimeEnvironment();
    const expectedToken = getVapiWebhookToken(environment);
    const encryptionKey = getCallDataEncryptionKey(environment);
    const body = await readWebhookBody(request);
    const result = await handleVapiWebhook(getDb(), {
      authorization: request.headers.get("authorization"),
      expectedToken,
      encryptionKey,
      body,
    });
    return Response.json(result, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof VapiWebhookError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: { "cache-control": "no-store" },
        },
      );
    }
    if (error instanceof CallConfigurationError) {
      return Response.json(
        {
          error: {
            code: "vapi_webhook_not_configured",
            message: error.message,
          },
        },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}

async function readWebhookBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512_000) {
    throw new VapiWebhookError(
      "payload_too_large",
      "Vapi webhook payload must not exceed 512 KB.",
      400,
    );
  }
  const text = await request.text();
  if (text.length > 512_000) {
    throw new VapiWebhookError(
      "payload_too_large",
      "Vapi webhook payload must not exceed 512 KB.",
      400,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new VapiWebhookError(
      "invalid_json",
      "Vapi webhook body must contain valid JSON.",
      400,
    );
  }
}
