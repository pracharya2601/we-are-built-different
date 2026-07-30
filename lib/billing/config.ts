import type {
  BillingConfig,
  BillingPlan,
  BillingProduct,
} from "./types";

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
  const products = new Map<string, BillingProduct>();
  addProduct(
    products,
    "platform-lite",
    "Platform Lite",
    env.STRIPE_PRODUCT_PLATFORM_LITE,
  );
  addProduct(
    products,
    "platform-pro",
    "Platform Pro",
    env.STRIPE_PRODUCT_PLATFORM_PRO,
  );

  const plans = new Map<string, BillingPlan>();
  addPlan(
    plans,
    "platform-lite",
    "Platform Lite",
    "platform-lite",
    env.STRIPE_PRICE_PLATFORM_LITE,
  );
  addPlan(
    plans,
    "platform-pro",
    "Platform Pro",
    "platform-pro",
    env.STRIPE_PRICE_PLATFORM_PRO,
  );

  const secretKey = trimmed(env.STRIPE_SECRET_KEY);
  const webhookSecret = trimmed(env.STRIPE_WEBHOOK_SECRET);
  if (secretKey && !/^sk_(test|live)_/.test(secretKey)) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a Stripe test or live secret key.",
    );
  }
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.",
    );
  }
  const litePriceId = plans.get("platform-lite")?.priceId;
  const proPriceId = plans.get("platform-pro")?.priceId;
  if (
    litePriceId &&
    proPriceId &&
    litePriceId === proPriceId
  ) {
    throw new Error(
      "Lite and Pro Stripe plans must use distinct Price IDs.",
    );
  }
  const missing = [
    ["STRIPE_SECRET_KEY", secretKey],
    ["STRIPE_WEBHOOK_SECRET", webhookSecret],
    [
      "STRIPE_PRICE_PLATFORM_LITE",
      plans.get("platform-lite")?.priceId,
    ],
    [
      "STRIPE_PRICE_PLATFORM_PRO",
      plans.get("platform-pro")?.priceId,
    ],
    [
      "STRIPE_PRODUCT_PLATFORM_LITE",
      products.get("platform-lite")?.productId,
    ],
    [
      "STRIPE_PRODUCT_PLATFORM_PRO",
      products.get("platform-pro")?.productId,
    ],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (
    !secretKey ||
    !webhookSecret ||
    plans.size !== 2 ||
    products.size !== 2
  ) {
    throw new Error(
      `Stripe configuration is required. Missing: ${missing.join(", ")}.`,
    );
  }

  return {
    secretKey,
    webhookSecret,
    expectedLivemode: secretKey.includes("_live_")
      ? true
      : secretKey.includes("_test_")
        ? false
        : null,
    plans,
    products,
    gracePeriodSeconds: positiveInteger(
      env.BILLING_GRACE_PERIOD_SECONDS,
      DEFAULT_GRACE_PERIOD_SECONDS,
    ),
    webhookToleranceSeconds: positiveInteger(
      env.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
      DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    ),
  };
}

export function isStripeConfigured(
  env: Environment = typeof process === "undefined" ? {} : process.env,
): boolean {
  try {
    loadBillingConfig(env);
    return true;
  } catch {
    return false;
  }
}

function addPlan(
  plans: Map<string, BillingPlan>,
  key: string,
  label: string,
  productKey: string,
  priceId: string | undefined,
): void {
  const normalizedPriceId = trimmed(priceId);
  if (!normalizedPriceId) return;
  if (!normalizedPriceId.startsWith("price_")) {
    throw new Error(`${key} must be configured with a Stripe Price ID.`);
  }
  plans.set(key, { key, label, productKey, priceId: normalizedPriceId });
}

function addProduct(
  products: Map<string, BillingProduct>,
  key: string,
  label: string,
  productId: string | undefined,
): void {
  const normalizedProductId = trimmed(productId);
  if (!normalizedProductId) return;
  if (!normalizedProductId.startsWith("prod_")) {
    throw new Error(`${key} must be configured with a Stripe Product ID.`);
  }
  products.set(key, { key, label, productId: normalizedProductId });
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
