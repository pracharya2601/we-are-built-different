import type {
  CallRecipientData,
  VapiCallConfiguration,
} from "./types.ts";

export class VapiRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly ambiguous: boolean;

  constructor(
    code: string,
    message: string,
    options: { retryable: boolean; ambiguous?: boolean },
  ) {
    super(message);
    this.name = "VapiRequestError";
    this.code = code;
    this.retryable = options.retryable;
    this.ambiguous = options.ambiguous ?? false;
  }
}

export async function createVapiCall(
  configuration: VapiCallConfiguration,
  input: {
    attemptId: string;
    jobId: string;
    recipient: CallRecipientData;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ id: string; status: string | null }> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${configuration.apiBaseUrl}/call`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.attemptId,
        },
        body: JSON.stringify({
          assistantId: configuration.assistantId,
          phoneNumberId: configuration.phoneNumberId,
          customer: {
            number: input.recipient.phoneNumber,
            name: input.recipient.name,
          },
          assistantOverrides: {
            variableValues: {
              recipientName: input.recipient.name,
              dentalAvailability: input.recipient.dentalAvailability,
              approvedContext: input.recipient.approvedContext,
              recipientTimezone: input.recipient.timezone,
              callJobId: input.jobId,
              callAttemptId: input.attemptId,
            },
          },
          metadata: {
            callJobId: input.jobId,
            callAttemptId: input.attemptId,
          },
        }),
      },
    );
  } catch (error) {
    throw new VapiRequestError(
      "vapi_network_error",
      error instanceof Error ? error.message : "Vapi request failed.",
      { retryable: false, ambiguous: true },
    );
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new VapiRequestError(
      `vapi_http_${response.status}`,
      providerErrorMessage(body, response.status),
      { retryable },
    );
  }
  if (!isRecord(body) || typeof body.id !== "string" || !body.id.trim()) {
    throw new VapiRequestError(
      "vapi_invalid_response",
      "Vapi returned a successful response without a call ID.",
      { retryable: false, ambiguous: true },
    );
  }
  return {
    id: body.id,
    status: typeof body.status === "string" ? body.status : null,
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return (await response.text()).slice(0, 500);
}

function providerErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    for (const key of ["message", "error"]) {
      if (typeof body[key] === "string") return body[key].slice(0, 500);
    }
  }
  if (typeof body === "string" && body) return body.slice(0, 500);
  return `Vapi returned HTTP ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
