import { FundingError } from "./errors.ts";
import type {
  AppointmentCheckoutRequest,
  AppointmentPaymentProvider,
} from "./payment-provider.ts";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export class StripeAppointmentPaymentProvider
  implements AppointmentPaymentProvider
{
  private readonly secretKey: string;
  private readonly request: typeof fetch;

  constructor(
    secretKey: string,
    request: typeof fetch = fetch,
  ) {
    this.secretKey = secretKey;
    this.request = request;
  }

  async createCheckout(input: AppointmentCheckoutRequest): Promise<{
    providerSessionId: string;
    checkoutUrl: string;
  }> {
    const metadata = {
      funding_scope: "appointment",
      workspace_id: input.workspaceId,
      appointment_id: input.appointmentId,
      payment_id: input.paymentId,
      payer_type: input.payerType,
    };
    const params = new URLSearchParams({
      mode: "payment",
      client_reference_id: input.paymentId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount),
      "line_items[0][price_data][product_data][name]":
        input.payerType === "sponsor"
          ? "OpenChair sponsor contribution"
          : "OpenChair patient contribution",
    });
    for (const [key, value] of Object.entries(metadata)) {
      params.set(`metadata[${key}]`, value);
      params.set(`payment_intent_data[metadata][${key}]`, value);
    }
    const requestedExpiry = Math.floor(
      new Date(input.expiresAt).getTime() / 1000,
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = Math.min(
      requestedExpiry,
      nowSeconds + 24 * 60 * 60,
    );
    if (expiresAtSeconds > nowSeconds + 30 * 60) {
      params.set("expires_at", String(expiresAtSeconds));
    }

    const result = await this.post(
      "/checkout/sessions",
      params,
      input.idempotencyKey,
    );
    if (
      !isRecord(result) ||
      typeof result.id !== "string" ||
      typeof result.url !== "string"
    ) {
      throw new FundingError(
        "invalid_stripe_response",
        "Stripe did not return a Checkout URL.",
        502,
      );
    }
    return { providerSessionId: result.id, checkoutUrl: result.url };
  }

  async refund(
    providerPaymentId: string,
    idempotencyKey: string,
  ): Promise<{ providerRefundId: string }> {
    const result = await this.post(
      "/refunds",
      new URLSearchParams({ payment_intent: providerPaymentId }),
      idempotencyKey,
    );
    if (!isRecord(result) || typeof result.id !== "string") {
      throw new FundingError(
        "invalid_stripe_response",
        "Stripe did not return a refund.",
        502,
      );
    }
    return { providerRefundId: result.id };
  }

  private async post(
    path: string,
    body: URLSearchParams,
    idempotencyKey: string,
  ): Promise<unknown> {
    const response = await this.request(`${STRIPE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        isRecord(payload) &&
        isRecord(payload.error) &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : "Stripe rejected the appointment payment request.";
      throw new FundingError("stripe_api_error", message, 502);
    }
    return payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
