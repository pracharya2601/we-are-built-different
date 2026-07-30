"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type ProductKey = "platform-lite" | "platform-pro";

type CheckoutResponse = {
  url?: string;
  error?: {
    message?: string;
  };
};

export function DynamicCheckoutForm({
  stripeConfigured,
}: {
  stripeConfigured: boolean;
}) {
  const [productKey, setProductKey] = useState<ProductKey>("platform-pro");
  const [amount, setAmount] = useState("50.00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const unitAmount = useMemo(() => dollarsToCents(amount), [amount]);
  const pricingKey =
    unitAmount === null
      ? "Waiting for a valid amount"
      : `dynamic:${productKey}:usd:${unitAmount}:month`;

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (unitAmount === null || unitAmount < 50 || unitAmount > 10_000_000) {
      setError("Enter an amount from $0.50 to $100,000.00.");
      return;
    }

    const requestBody = {
      type: "dynamic-monthly",
      productKey,
      unitAmount,
      currency: "usd",
    } as const;
    const signature = JSON.stringify(requestBody);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = {
        signature,
        key: `pricing-router-${crypto.randomUUID()}`,
      };
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body: signature,
      });
      const payload = await readCheckoutResponse(response);
      if (!response.ok || !payload.url) {
        throw new Error(
          payload.error?.message ?? "Stripe Checkout could not be created.",
        );
      }
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Stripe Checkout could not be created.",
      );
      setSubmitting(false);
    }
  }

  return (
    <section className="pricing-router-grid">
      <form className="content-card router-form" onSubmit={submitCheckout}>
        <div>
          <p className="kicker">Checkout input</p>
          <h2>Create a monthly subscription</h2>
        </div>

        <label className="field-label" htmlFor="dynamic-product">
          Service product
        </label>
        <select
          id="dynamic-product"
          name="productKey"
          onChange={(event) =>
            setProductKey(event.target.value as ProductKey)
          }
          value={productKey}
        >
          <option value="platform-lite">Being Different Lite</option>
          <option value="platform-pro">Being Different Pro</option>
        </select>

        <label className="field-label" htmlFor="dynamic-amount">
          Monthly amount
        </label>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <input
            id="dynamic-amount"
            inputMode="decimal"
            max="100000"
            min="0.50"
            name="amount"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="50.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
          <span>USD</span>
        </div>

        <div className="amount-presets" aria-label="Example amounts">
          {["20.00", "50.00"].map((preset) => (
            <button
              className="amount-preset"
              key={preset}
              onClick={() => setAmount(preset)}
              type="button"
            >
              ${Number(preset).toFixed(0)}
            </button>
          ))}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="button button-primary"
          disabled={!stripeConfigured || submitting}
          type="submit"
        >
          {!stripeConfigured
            ? "Stripe setup required"
            : submitting
              ? "Creating checkout…"
              : "Continue to Stripe"}
        </button>
        <small>
          This creates a real Checkout Session in the configured Stripe
          environment. Access changes only after a verified webhook.
        </small>
      </form>

      <aside className="content-card request-preview">
        <p className="kicker">Request preview</p>
        <h2>Core-product contract</h2>
        <pre>
          {JSON.stringify(
            {
              type: "dynamic-monthly",
              productKey,
              unitAmount: unitAmount ?? "invalid",
              currency: "usd",
            },
            null,
            2,
          )}
        </pre>
        <dl>
          <div>
            <dt>Endpoint</dt>
            <dd>/api/v1/billing/checkout</dd>
          </div>
          <div>
            <dt>Stable pricing key</dt>
            <dd>{pricingKey}</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Billing manager session</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}

function dollarsToCents(value: string): number | null {
  const normalized = value.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const dollars = Number.parseInt(match[1], 10);
  const cents = Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10) || 0;
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

async function readCheckoutResponse(
  response: Response,
): Promise<CheckoutResponse> {
  try {
    return (await response.json()) as CheckoutResponse;
  } catch {
    return {};
  }
}
