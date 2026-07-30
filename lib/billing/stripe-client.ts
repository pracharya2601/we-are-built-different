import { StripeApiError } from "./errors.ts";
import type {
  StripeBillingGateway,
  StripeCustomer,
  StripeHostedSession,
} from "./types";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeClientOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
};

/**
 * Small Web API-only Stripe REST client. It intentionally avoids Node-only
 * crypto/stream APIs so it can run in Cloudflare Workers.
 */
export class StripeRestGateway implements StripeBillingGateway {
  private readonly secretKey: string;
  private readonly request: typeof fetch;
  private readonly apiBase: string;

  constructor(
    secretKey: string,
    options: StripeClientOptions = {},
  ) {
    this.secretKey = secretKey;
    this.request = options.fetch ?? fetch;
    this.apiBase = options.apiBase ?? STRIPE_API_BASE;
  }

  createCustomer(input: {
    workspaceId: string;
    email: string | null;
    idempotencyKey: string;
  }): Promise<StripeCustomer> {
    const params = new URLSearchParams({
      "metadata[workspace_id]": input.workspaceId,
    });
    if (input.email) params.set("email", input.email);

    return this.post("/customers", params, input.idempotencyKey);
  }

  createCheckoutSession(input: {
    workspaceId: string;
    stripeCustomerId: string;
    price:
      | {
          kind: "catalog";
          key: string;
          productKey: string;
          priceId: string;
        }
      | {
          kind: "dynamic";
          key: string;
          productKey: string;
          productId: string;
          currency: "usd";
          unitAmount: number;
          interval: "month";
        };
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<StripeHostedSession> {
    const params = new URLSearchParams({
      mode: "subscription",
      customer: input.stripeCustomerId,
      client_reference_id: input.workspaceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][quantity]": "1",
      "metadata[workspace_id]": input.workspaceId,
      "metadata[pricing_key]": input.price.key,
      "metadata[pricing_kind]": input.price.kind,
      "metadata[product_key]": input.price.productKey,
      "subscription_data[metadata][workspace_id]": input.workspaceId,
      "subscription_data[metadata][pricing_key]": input.price.key,
      "subscription_data[metadata][pricing_kind]": input.price.kind,
      "subscription_data[metadata][product_key]": input.price.productKey,
    });
    if (input.price.kind === "catalog") {
      params.set("line_items[0][price]", input.price.priceId);
    } else {
      params.set(
        "line_items[0][price_data][currency]",
        input.price.currency,
      );
      params.set(
        "line_items[0][price_data][product]",
        input.price.productId,
      );
      params.set(
        "line_items[0][price_data][unit_amount]",
        String(input.price.unitAmount),
      );
      params.set(
        "line_items[0][price_data][recurring][interval]",
        input.price.interval,
      );
    }

    return this.post(
      "/checkout/sessions",
      params,
      input.idempotencyKey,
    );
  }

  createPortalSession(input: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<StripeHostedSession> {
    return this.post(
      "/billing_portal/sessions",
      new URLSearchParams({
        customer: input.stripeCustomerId,
        return_url: input.returnUrl,
      }),
    );
  }

  private async post<T>(
    path: string,
    body: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers = new Headers({
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

    const response = await this.request(`${this.apiBase}${path}`, {
      method: "POST",
      headers,
      body,
    });
    const requestId = response.headers.get("request-id");
    const payload = await safeJson(response);

    if (!response.ok) {
      throw new StripeApiError(
        stripeErrorMessage(payload),
        response.status,
        requestId,
      );
    }
    return payload as T;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new StripeApiError(
      "Stripe returned an invalid response.",
      response.status,
      response.headers.get("request-id"),
    );
  }
}

function stripeErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "Stripe rejected the billing request.";
}
