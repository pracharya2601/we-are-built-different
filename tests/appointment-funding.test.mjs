import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadAppointmentFundingConfig } from "../lib/openchair/funding/config.ts";
import { StripeAppointmentPaymentProvider } from "../lib/openchair/funding/stripe-provider.ts";

test("appointment funding Stripe config is separate from SaaS billing", () => {
  const config = loadAppointmentFundingConfig({
    STRIPE_APPOINTMENT_SECRET_KEY: "sk_test_appointment",
    STRIPE_APPOINTMENT_WEBHOOK_SECRET: "whsec_appointment",
  });
  assert.equal(config.expectedLivemode, false);
  assert.equal(config.secretKey, "sk_test_appointment");
});

test("sponsor and patient Checkouts are one-time appointment payments", async () => {
  const requests = [];
  const provider = new StripeAppointmentPaymentProvider(
    "sk_test_appointment",
    async (url, init) => {
      requests.push({ url, init });
      return Response.json({
        id: `cs_test_${requests.length}`,
        url: `https://checkout.stripe.test/${requests.length}`,
      });
    },
  );

  for (const payerType of ["sponsor", "patient"]) {
    const result = await provider.createCheckout({
      paymentId: `pay_${payerType}`,
      appointmentId: "appt_demo",
      workspaceId: "wsp_demo",
      payerType,
      amount: payerType === "sponsor" ? 8_000 : 2_000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      idempotencyKey: `checkout:${payerType}:12345678`,
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
    });
    assert.match(result.checkoutUrl, /^https:\/\/checkout\.stripe\.test/u);
  }

  assert.equal(requests.length, 2);
  for (const { init } of requests) {
    const body = new URLSearchParams(init.body);
    assert.equal(body.get("mode"), "payment");
    assert.equal(body.get("metadata[funding_scope]"), "appointment");
    assert.equal(
      body.get("payment_intent_data[metadata][funding_scope]"),
      "appointment",
    );
    assert.equal(body.has("subscription_data[metadata][workspace_id]"), false);
  }
});

test("funding journal and retries are represented by append-only tables", async () => {
  const [migration, schema, service] = await Promise.all([
    readFile(
      new URL("../drizzle/0010_appointment_funding.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/openchair/funding/service.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(migration, /openchair_payment_attempts/u);
  assert.match(migration, /openchair_funding_ledger_entries/u);
  assert.match(schema, /PAYMENT_RECEIVED/u);
  assert.match(schema, /REFUND_ISSUED/u);
  assert.doesNotMatch(service, /delete\(openchairFundingLedgerEntries\)/u);
  assert.doesNotMatch(service, /update\(openchairFundingLedgerEntries\)/u);
});
