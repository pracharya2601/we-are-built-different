import type { BillingConfig, BillingPlan } from "./types";

type Environment = Record<string, string | undefined>;

const DEFAULT_GRACE_PERIOD_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Plan keys are fixed server-side. The client may select a key but can never
 * submit an arbitrary Stripe Price ID.
 */
export function loadBillingConfig(
  env: Environment = typeof process === "undefined" ? {} : process.env,
): BillingConfig {
  const plans = new Map<string, BillingPlan>();
  addPlan(plans, "platform-monthly", "Platform monthly", env.STRIPE_PRICE_PLATFORM_MONTHLY);
  addPlan(plans, "platform-annual", "Platform annual", env.STRIPE_PRICE_PLATFORM_ANNUAL);

  const shared = {
    plans,
    gracePeriodSeconds: positiveInteger(
      env.BILLING_GRACE_PERIOD_SECONDS,
      DEFAULT_GRACE_PERIOD_SECONDS,
    ),
    webhookToleranceSeconds: positiveInteger(
      env.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
      DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    ),
  };

  const secretKey = trimmed(env.STRIPE_SECRET_KEY);
  if (!secretKey) return { mode: "demo", ...shared };

  return {
    mode: "live",
    secretKey,
    webhookSecret: trimmed(env.STRIPE_WEBHOOK_SECRET),
    expectedLivemode: secretKey.includes("_live_")
      ? true
      : secretKey.includes("_test_")
        ? false
        : null,
    ...shared,
  };
}

function addPlan(
  plans: Map<string, BillingPlan>,
  key: string,
  label: string,
  priceId: string | undefined,
): void {
  const normalizedPriceId = trimmed(priceId);
  if (!normalizedPriceId) return;
  if (!normalizedPriceId.startsWith("price_")) {
    throw new Error(`${key} must be configured with a Stripe Price ID.`);
  }
  plans.set(key, { key, label, priceId: normalizedPriceId });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}
