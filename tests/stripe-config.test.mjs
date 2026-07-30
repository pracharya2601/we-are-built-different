import assert from "node:assert/strict";
import test from "node:test";

import {
  isStripeConfigured,
  loadBillingConfig,
} from "../lib/billing/config.ts";

const validEnvironment = {
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_PLATFORM_LITE: "price_lite",
  STRIPE_PRICE_PLATFORM_PRO: "price_pro",
  STRIPE_PRODUCT_PLATFORM_LITE: "prod_lite",
  STRIPE_PRODUCT_PLATFORM_PRO: "prod_pro",
};

test("Stripe configuration requires the complete sandbox contract", () => {
  assert.throws(
    () => loadBillingConfig({}),
    /STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET.*STRIPE_PRICE_PLATFORM_LITE.*STRIPE_PRICE_PLATFORM_PRO.*STRIPE_PRODUCT_PLATFORM_LITE.*STRIPE_PRODUCT_PLATFORM_PRO/,
  );
  assert.equal(isStripeConfigured({}), false);
});

test("Stripe configuration accepts distinct allowlisted recurring prices", () => {
  const config = loadBillingConfig(validEnvironment);

  assert.equal(config.expectedLivemode, false);
  assert.equal(config.plans.get("platform-lite")?.priceId, "price_lite");
  assert.equal(config.plans.get("platform-pro")?.priceId, "price_pro");
  assert.equal(
    config.products.get("platform-lite")?.productId,
    "prod_lite",
  );
  assert.equal(isStripeConfigured(validEnvironment), true);
});

test("Stripe configuration rejects malformed credentials and prices", () => {
  assert.throws(
    () =>
      loadBillingConfig({
        ...validEnvironment,
        STRIPE_SECRET_KEY: "pk_test_public",
      }),
    /must be a Stripe test or live secret key/,
  );
  assert.throws(
    () =>
      loadBillingConfig({
        ...validEnvironment,
        STRIPE_WEBHOOK_SECRET: "not-a-signing-secret",
      }),
    /must be a Stripe webhook signing secret/,
  );
  assert.throws(
    () =>
      loadBillingConfig({
        ...validEnvironment,
        STRIPE_PRICE_PLATFORM_LITE: "prod_not_a_price",
      }),
    /must be configured with a Stripe Price ID/,
  );
  assert.throws(
    () =>
      loadBillingConfig({
        ...validEnvironment,
        STRIPE_PRODUCT_PLATFORM_PRO: "price_not_a_product",
      }),
    /must be configured with a Stripe Product ID/,
  );
});

test("Stripe configuration rejects one Price ID reused for both plans", () => {
  assert.throws(
    () =>
      loadBillingConfig({
        ...validEnvironment,
        STRIPE_PRICE_PLATFORM_PRO: "price_lite",
      }),
    /must use distinct Price IDs/,
  );
  assert.equal(
    isStripeConfigured({
      ...validEnvironment,
      STRIPE_PRICE_PLATFORM_PRO: "price_lite",
    }),
    false,
  );
});
