export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export class StripeApiError extends BillingError {
  constructor(
    message: string,
    readonly stripeStatus: number,
    readonly stripeRequestId: string | null,
  ) {
    super(message, "stripe_api_error", 502);
    this.name = "StripeApiError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof BillingError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  // Auth adapters can expose transport-safe 401/403 errors without making
  // billing import a particular identity provider.
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error.status === 401 || error.status === 403) &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return Response.json(
      {
        error: {
          code: error.code,
          message:
            error instanceof Error ? error.message : "Access is not allowed.",
        },
      },
      { status: error.status },
    );
  }

  console.error("Unhandled billing error", error);
  return Response.json(
    {
      error: {
        code: "billing_internal_error",
        message: "Billing is temporarily unavailable.",
      },
    },
    { status: 500 },
  );
}
