import { BillingError, errorResponse } from "./errors";
import { resolveCheckoutPrice } from "./pricing-router";
import { ingestStripeWebhook } from "./webhook";
import type { BillingRuntime } from "./types";
import { planAllowedForAccount } from "../accounts";

export async function handleCreateCheckout(
  request: Request,
  runtime: BillingRuntime,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const auth = await runtime.auth.requireBillingManager(request);
    const isForm = isHtmlFormSubmission(request);
    const body = await readRequestObject(request);
    const price = resolveCheckoutPrice(body, runtime.config);
    if (
      price.kind === "catalog" &&
      !planAllowedForAccount(auth.accountType, price.key)
    ) {
      throw new BillingError(
        "This billing plan is not available for the active account type.",
        "billing_plan_not_allowed",
        403,
      );
    }
    if (price.kind === "dynamic" && auth.accountType !== "nonprofit") {
      throw new BillingError(
        "Custom contribution pricing is available only to nonprofit workspaces.",
        "dynamic_pricing_not_allowed",
        403,
      );
    }
    if (
      price.kind === "dynamic" &&
      !validIdempotencyKey(request.headers.get("idempotency-key"))
    ) {
      throw new BillingError(
        "Dynamic Checkout requires an Idempotency-Key header.",
        "missing_idempotency_key",
        400,
      );
    }

    const account = await runtime.store.getBillingAccount(auth.workspaceId);
    let stripeCustomerId = account?.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const customer = await runtime.stripe.createCustomer({
        workspaceId: auth.workspaceId,
        email: auth.email,
        idempotencyKey: `workspace-customer:${auth.workspaceId}`,
      });
      stripeCustomerId = customer.id;
      await runtime.store.setStripeCustomerId(auth.workspaceId, customer.id);
    }

    const origin = trustedRequestOrigin(request);
    const onboarding = auth.accountType === "service_provider";
    const checkout = await runtime.stripe.createCheckoutSession({
      workspaceId: auth.workspaceId,
      stripeCustomerId,
      price,
      // This page only reports that checkout returned. Entitlement state is
      // updated exclusively from verified webhooks.
      successUrl: onboarding
        ? `${origin}/onboarding/subscription/return?checkout=returned`
        : `${origin}/dashboard/billing/return?checkout=returned`,
      cancelUrl: onboarding
        ? `${origin}/onboarding/subscription?checkout=canceled`
        : `${origin}/dashboard/billing?checkout=canceled`,
      idempotencyKey: checkoutIdempotencyKey(
        request,
        auth.workspaceId,
        price.key,
      ),
    });
    return isForm
      ? Response.redirect(checkout.url, 303)
      : Response.json(
          {
            mode: "live",
            url: checkout.url,
            checkoutSessionId: checkout.id,
            pricingKey: price.key,
          },
          { status: 201 },
        );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreatePortalSession(
  request: Request,
  runtime: BillingRuntime,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const auth = await runtime.auth.requireBillingManager(request);
    const account = await runtime.store.getBillingAccount(auth.workspaceId);
    if (!account?.stripeCustomerId) {
      throw new BillingError(
        "This workspace does not have a billing account yet.",
        "billing_account_not_found",
        409,
      );
    }

    const portal = await runtime.stripe.createPortalSession({
      stripeCustomerId: account.stripeCustomerId,
      returnUrl:
        auth.accountType === "service_provider"
          ? `${trustedRequestOrigin(request)}/onboarding/subscription`
          : `${trustedRequestOrigin(request)}/dashboard/billing`,
    });
    return isHtmlFormSubmission(request)
      ? Response.redirect(portal.url, 303)
      : Response.json({ mode: "live", url: portal.url });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleStripeWebhook(
  request: Request,
  runtime: BillingRuntime,
): Promise<Response> {
  try {
    const result = await ingestStripeWebhook(request, runtime);
    return Response.json({ received: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

async function readRequestObject(
  request: Request,
): Promise<Record<string, unknown>> {
  if (isHtmlFormSubmission(request)) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new BillingError(
      "Request body must be valid JSON.",
      "invalid_json",
      400,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BillingError(
      "Request body must be a JSON object.",
      "invalid_json",
      400,
    );
  }
  return value as Record<string, unknown>;
}

function isHtmlFormSubmission(request: Request): boolean {
  return request.headers
    .get("content-type")
    ?.toLowerCase()
    .startsWith("application/x-www-form-urlencoded") === true;
}

function assertSameOrigin(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin && suppliedOrigin !== requestOrigin) {
    throw new BillingError(
      "Cross-origin billing mutations are not allowed.",
      "invalid_request_origin",
      403,
    );
  }
}

function trustedRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new BillingError(
      "Billing requests require HTTPS.",
      "insecure_billing_origin",
      400,
    );
  }
  return url.origin;
}

function checkoutIdempotencyKey(
  request: Request,
  workspaceId: string,
  planKey: string,
): string {
  const supplied = request.headers.get("idempotency-key")?.trim();
  if (validIdempotencyKey(supplied)) {
    return `checkout:${workspaceId}:${planKey}:${supplied}`;
  }
  // A fresh Checkout Session is appropriate for a fresh attempt. Callers that
  // retry the same action should send an Idempotency-Key.
  return `checkout:${workspaceId}:${planKey}:${crypto.randomUUID()}`;
}

function validIdempotencyKey(value: string | null | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_:.+-]{8,128}$/u.test(value.trim()));
}
