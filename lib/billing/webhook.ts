import { projectSubscriptionAccess } from "./access.ts";
import { BillingError } from "./errors.ts";
import { dynamicPricingKey } from "./pricing-router.ts";
import { verifyStripeWebhookSignature } from "./stripe-signature.ts";
import {
  PLATFORM_ACCESS_FEATURE,
  type BillingRuntime,
  type StripeEventEnvelope,
  type StripeSubscriptionStatus,
} from "./types.ts";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function ingestStripeWebhook(
  request: Request,
  runtime: BillingRuntime,
): Promise<{ duplicate: boolean; handled: boolean }> {
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    throw new BillingError(
      "Stripe-Signature header is required.",
      "missing_webhook_signature",
      400,
    );
  }

  // `text()` is called exactly once; signature verification must use this
  // unmodified raw request body.
  const rawBody = await request.text();
  await verifyStripeWebhookSignature({
    payload: rawBody,
    signatureHeader,
    secret: runtime.config.webhookSecret,
    toleranceSeconds: runtime.config.webhookToleranceSeconds,
    now: runtime.now?.(),
  });

  const event = parseEvent(rawBody);
  if (
    runtime.config.expectedLivemode !== null &&
    event.livemode !== runtime.config.expectedLivemode
  ) {
    throw new BillingError(
      "Stripe event mode does not match the configured API key.",
      "stripe_event_mode_mismatch",
      400,
    );
  }
  const claim = await runtime.store.claimStripeEvent(event);
  if (claim.state !== "claimed") {
    return { duplicate: true, handled: SUBSCRIPTION_EVENTS.has(event.type) };
  }

  try {
    const handled = await applyStripeEvent(event, runtime);
    await runtime.store.completeStripeEvent(claim.claimId);
    return { duplicate: false, handled };
  } catch (error) {
    await runtime.store.failStripeEvent(claim.claimId, errorMessage(error));
    throw error;
  }
}

export async function applyStripeEvent(
  event: StripeEventEnvelope,
  runtime: BillingRuntime,
): Promise<boolean> {
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return false;

  const subscription = parseSubscription(event.data.object);
  const account =
    (subscription.workspaceId
      ? await runtime.store.getBillingAccount(subscription.workspaceId)
      : null) ??
    (await runtime.store.getBillingAccountByStripeCustomerId(
      subscription.customerId,
    ));

  if (!account) {
    throw new BillingError(
      "No workspace is mapped to this Stripe customer.",
      "stripe_customer_not_mapped",
      422,
    );
  }
  if (
    account.stripeCustomerId &&
    account.stripeCustomerId !== subscription.customerId
  ) {
    throw new BillingError(
      "Stripe customer does not match the workspace billing account.",
      "stripe_customer_workspace_mismatch",
      422,
    );
  }

  const periodEnd = unixDate(subscription.currentPeriodEnd);
  const catalogPlan =
    subscription.priceId === null
      ? null
      : [...runtime.config.plans.values()].find(
          (plan) => plan.priceId === subscription.priceId,
        ) ?? null;
  const dynamicProduct = subscription.productKey
    ? runtime.config.products.get(subscription.productKey)
    : null;
  const dynamicPriceIsAllowed = Boolean(
    subscription.pricingKind === "dynamic" &&
      dynamicProduct &&
      subscription.productId === dynamicProduct.productId &&
      subscription.currency === "usd" &&
      subscription.interval === "month" &&
      subscription.unitAmount !== null &&
      subscription.pricingKey ===
        dynamicPricingKey(dynamicProduct.key, subscription.unitAmount),
  );
  const resolvedPricingKey =
    catalogPlan?.key ??
    (dynamicPriceIsAllowed ? subscription.pricingKey : null);
  const priceIsAllowed = resolvedPricingKey !== null;
  const access = priceIsAllowed
    ? projectSubscriptionAccess({
        status: subscription.status,
        currentPeriodEnd: periodEnd,
        gracePeriodSeconds: runtime.config.gracePeriodSeconds,
        now: runtime.now?.(),
      })
    : { state: "inactive" as const, graceEndsAt: null };

  await runtime.store.upsertSubscriptionProjection({
    workspaceId: account.workspaceId,
    stripeCustomerId: subscription.customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.priceId,
    pricingKey: resolvedPricingKey,
    stripeStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodEnd: periodEnd,
    accessState: access.state,
    featureKey: PLATFORM_ACCESS_FEATURE,
    graceEndsAt: access.graceEndsAt,
    sourceEventId: event.id,
    sourceEventCreatedAt: new Date(event.created * 1000),
  });
  return true;
}

function parseEvent(rawBody: string): StripeEventEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new BillingError(
      "Stripe webhook body is not valid JSON.",
      "invalid_webhook_payload",
      400,
    );
  }
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.created !== "number" ||
    typeof value.livemode !== "boolean" ||
    !isRecord(value.data) ||
    !("object" in value.data)
  ) {
    throw new BillingError(
      "Stripe webhook event is missing required fields.",
      "invalid_webhook_event",
      400,
    );
  }
  return value as StripeEventEnvelope;
}

function parseSubscription(value: unknown): {
  id: string;
  customerId: string;
  workspaceId: string | null;
  pricingKey: string | null;
  pricingKind: string | null;
  productKey: string | null;
  status: StripeSubscriptionStatus;
  priceId: string | null;
  productId: string | null;
  currency: string | null;
  unitAmount: number | null;
  interval: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
} {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw invalidSubscription();
  }
  const customerId =
    typeof value.customer === "string"
      ? value.customer
      : isRecord(value.customer) && typeof value.customer.id === "string"
        ? value.customer.id
        : null;
  if (
    !customerId ||
    typeof value.status !== "string" ||
    !isSubscriptionStatus(value.status)
  ) {
    throw invalidSubscription();
  }

  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const workspaceId =
    metadata && typeof metadata.workspace_id === "string"
      ? metadata.workspace_id
      : null;
  const pricingKey =
    metadata && typeof metadata.pricing_key === "string"
      ? metadata.pricing_key
      : null;
  const pricingKind =
    metadata && typeof metadata.pricing_kind === "string"
      ? metadata.pricing_kind
      : null;
  const productKey =
    metadata && typeof metadata.product_key === "string"
      ? metadata.product_key
      : null;
  const items = isRecord(value.items) && Array.isArray(value.items.data)
    ? value.items.data
    : [];
  const firstItem = isRecord(items[0]) ? items[0] : null;
  const price = firstItem && isRecord(firstItem.price) ? firstItem.price : null;
  const priceId = price && typeof price.id === "string" ? price.id : null;
  const productId =
    price && typeof price.product === "string"
      ? price.product
      : price &&
          isRecord(price.product) &&
          typeof price.product.id === "string"
        ? price.product.id
        : null;
  const recurring =
    price && isRecord(price.recurring) ? price.recurring : null;

  return {
    id: value.id,
    customerId,
    workspaceId,
    pricingKey,
    pricingKind,
    productKey,
    status: value.status,
    priceId,
    productId,
    currency: price && typeof price.currency === "string" ? price.currency : null,
    unitAmount:
      price && typeof price.unit_amount === "number"
        ? price.unit_amount
        : null,
    interval:
      recurring && typeof recurring.interval === "string"
        ? recurring.interval
        : null,
    cancelAtPeriodEnd: value.cancel_at_period_end === true,
    currentPeriodEnd:
      typeof value.current_period_end === "number"
        ? value.current_period_end
        : null,
  };
}

function isSubscriptionStatus(
  value: string,
): value is StripeSubscriptionStatus {
  return [
    "active",
    "trialing",
    "past_due",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "canceled",
    "paused",
  ].includes(value);
}

function invalidSubscription(): BillingError {
  return new BillingError(
    "Stripe subscription payload is missing required fields.",
    "invalid_subscription_payload",
    422,
  );
}

function unixDate(seconds: number | null): Date | null {
  return seconds === null ? null : new Date(seconds * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}
