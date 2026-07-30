import assert from "node:assert/strict";
import test from "node:test";

import { loadBillingConfig } from "../lib/billing/config.ts";
import { StripeRestGateway } from "../lib/billing/stripe-client.ts";
import { applyStripeEvent } from "../lib/billing/webhook.ts";

const config = loadBillingConfig({
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_PLATFORM_LITE: "price_lite",
  STRIPE_PRICE_PLATFORM_PRO: "price_pro",
  STRIPE_PRODUCT_PLATFORM_LITE: "prod_lite",
  STRIPE_PRODUCT_PLATFORM_PRO: "prod_pro",
});

test("Stripe gateway creates dynamic monthly inline price data", async () => {
  let request;
  const gateway = new StripeRestGateway("sk_test_example", {
    fetch: async (url, options) => {
      request = { url, options };
      return Response.json({
        id: "cs_test_dynamic",
        url: "https://checkout.stripe.test/session",
      });
    },
  });

  await gateway.createCheckoutSession({
    workspaceId: "wsp_example",
    stripeCustomerId: "cus_example",
    price: {
      kind: "dynamic",
      key: "dynamic:platform-pro:usd:5000:month",
      productKey: "platform-pro",
      productId: "prod_pro",
      label: "Platform Pro custom",
      currency: "usd",
      unitAmount: 5000,
      interval: "month",
    },
    successUrl: "https://app.example/return",
    cancelUrl: "https://app.example/cancel",
    idempotencyKey: "checkout-example",
  });

  const body = request.options.body;
  assert.equal(body.get("mode"), "subscription");
  assert.equal(body.get("line_items[0][price]"), null);
  assert.equal(body.get("line_items[0][price_data][product]"), "prod_pro");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "5000");
  assert.equal(
    body.get("line_items[0][price_data][recurring][interval]"),
    "month",
  );
  assert.equal(
    body.get("subscription_data[metadata][pricing_key]"),
    "dynamic:platform-pro:usd:5000:month",
  );
  assert.equal(
    request.options.headers.get("Idempotency-Key"),
    "checkout-example",
  );
});

test("verified dynamic subscription metadata activates access", async () => {
  let projection;
  const runtime = {
    config,
    store: {
      getBillingAccount: async () => ({
        workspaceId: "wsp_example",
        stripeCustomerId: "cus_example",
      }),
      getBillingAccountByStripeCustomerId: async () => null,
      upsertSubscriptionProjection: async (value) => {
        projection = value;
      },
    },
  };
  const event = {
    id: "evt_dynamic",
    type: "customer.subscription.created",
    created: 1_700_000_000,
    livemode: false,
    data: {
      object: {
        id: "sub_dynamic",
        customer: "cus_example",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: 1_800_000_000,
        metadata: {
          workspace_id: "wsp_example",
          pricing_kind: "dynamic",
          pricing_key: "dynamic:platform-pro:usd:5000:month",
          product_key: "platform-pro",
        },
        items: {
          data: [
            {
              price: {
                id: "price_inline",
                product: "prod_pro",
                currency: "usd",
                unit_amount: 5000,
                recurring: { interval: "month" },
              },
            },
          ],
        },
      },
    },
  };

  assert.equal(await applyStripeEvent(event, runtime), true);
  assert.equal(projection.accessState, "active");
  assert.equal(
    projection.pricingKey,
    "dynamic:platform-pro:usd:5000:month",
  );

  event.data.object.metadata.pricing_key =
    "dynamic:platform-pro:usd:2000:month";
  await applyStripeEvent(
    { ...event, id: "evt_tampered", created: event.created + 1 },
    runtime,
  );
  assert.equal(projection.accessState, "inactive");
  assert.equal(projection.pricingKey, null);
});
