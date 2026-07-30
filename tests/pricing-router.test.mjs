import assert from "node:assert/strict";
import test from "node:test";

import { loadBillingConfig } from "../lib/billing/config.ts";
import {
  MAX_DYNAMIC_UNIT_AMOUNT,
  MIN_DYNAMIC_UNIT_AMOUNT,
  resolveCheckoutPrice,
} from "../lib/billing/pricing-router.ts";

const config = loadBillingConfig({
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_PLATFORM_LITE: "price_lite",
  STRIPE_PRICE_PLATFORM_PRO: "price_pro",
  STRIPE_PRODUCT_PLATFORM_LITE: "prod_lite",
  STRIPE_PRODUCT_PLATFORM_PRO: "prod_pro",
});

test("pricing router resolves fixed catalog plans server-side", () => {
  assert.deepEqual(resolveCheckoutPrice({ planKey: "platform-lite" }, config), {
    kind: "catalog",
    key: "platform-lite",
    label: "Platform Lite",
    productKey: "platform-lite",
    priceId: "price_lite",
  });
});

test("pricing router resolves validated dynamic monthly cents", () => {
  assert.deepEqual(
    resolveCheckoutPrice(
      {
        type: "dynamic-monthly",
        productKey: "platform-pro",
        unitAmount: 5000,
        currency: "usd",
      },
      config,
    ),
    {
      kind: "dynamic",
      key: "dynamic:platform-pro:usd:5000:month",
      label: "Platform Pro custom",
      productKey: "platform-pro",
      productId: "prod_pro",
      currency: "usd",
      unitAmount: 5000,
      interval: "month",
    },
  );
});

test("pricing router rejects unsafe dynamic amounts and products", () => {
  for (const unitAmount of [
    20.5,
    MIN_DYNAMIC_UNIT_AMOUNT - 1,
    MAX_DYNAMIC_UNIT_AMOUNT + 1,
  ]) {
    assert.throws(
      () =>
        resolveCheckoutPrice(
          {
            type: "dynamic-monthly",
            productKey: "platform-lite",
            unitAmount,
          },
          config,
        ),
      /unitAmount must be an integer/,
    );
  }
  assert.throws(
    () =>
      resolveCheckoutPrice(
        {
          type: "dynamic-monthly",
          productKey: "untrusted-product",
          unitAmount: 2000,
        },
        config,
      ),
    /product is not configured/,
  );
  assert.throws(
    () =>
      resolveCheckoutPrice(
        {
          type: "dynamic-monthly",
          productKey: "platform-lite",
          unitAmount: 2000,
          currency: "eur",
        },
        config,
      ),
    /supports USD only/,
  );
});
