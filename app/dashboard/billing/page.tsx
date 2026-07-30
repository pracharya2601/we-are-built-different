import Link from "next/link";

import { requireWorkspacePermission } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/billing";
import { companyConfig } from "@/lib/config";
import { ACCOUNT_POLICIES } from "@/lib/accounts";

const plans = [
  {
    code: "platform-lite",
    name: "Lite",
    price: "$10",
    interval: "per month",
    description:
      "Core platform access for essential workflows and standard service limits.",
  },
  {
    code: "platform-pro",
    name: "Pro",
    price: "$20",
    interval: "per month",
    description:
      "Advanced platform access for expanded workflows and service limits.",
  },
] as const;

export default async function BillingPage() {
  const auth = await requireWorkspacePermission("billing:manage");
  const stripeConfigured = isStripeConfigured();
  const policy = ACCOUNT_POLICIES[auth.accountType];
  const availablePlans = plans.filter((plan) =>
    policy.allowedPlanKeys.includes(plan.code),
  );

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {companyConfig.company.shortName}
          </span>
          <div>
            <strong>{companyConfig.company.name}</strong>
            <span>Billing settings</span>
          </div>
        </div>
        <span className={`status-pill ${stripeConfigured ? "" : "warning"}`}>
          {stripeConfigured ? "Stripe connected" : "Configuration required"}
        </span>
      </header>

      <section className="page-heading">
        <p className="kicker">Platform subscription</p>
        <h1>Choose the pace.</h1>
        <p>
          Both tiers unlock the stable{" "}
          <strong>{companyConfig.entitlements.productAccessKey}</strong>{" "}
          entitlement. Checkout is created server-side from an allowlisted plan
          code.
        </p>
      </section>

      <section className="metric-grid" aria-label="Available plans">
        {availablePlans.map((plan) => (
          <article className="content-card" key={plan.code}>
            <span className="kicker">{plan.name}</span>
            <h2 style={{ fontSize: "2.7rem", margin: "24px 0 0" }}>
              {plan.price}
            </h2>
            <p style={{ color: "var(--muted)", marginTop: 4 }}>
              {plan.interval}
            </p>
            <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
              {plan.description}
            </p>
            <form action="/api/billing/checkout" method="post">
              <input name="planKey" type="hidden" value={plan.code} />
              <button
                className="button button-primary"
                disabled={!stripeConfigured}
                type="submit"
              >
                {stripeConfigured
                  ? "Continue to Stripe"
                  : "Stripe setup required"}
              </button>
            </form>
          </article>
        ))}
        {auth.accountType === "nonprofit" ? (
        <article className="content-card">
          <span className="kicker">Dynamic pricing router</span>
          <h2 style={{ marginTop: 24 }}>Choose any approved amount</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            Create a real monthly Checkout for $20, $50, or a custom amount
            through the core-product API contract.
          </p>
          <Link
            className="button button-secondary"
            href="/dashboard/billing/pricing-router"
          >
            Open pricing router
          </Link>
        </article>
        ) : null}
        <article className="content-card">
          <span className="kicker">Already subscribed?</span>
          <h2 style={{ marginTop: 24 }}>Manage billing</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            Update payment methods, download invoices, or cancel from Stripe’s
            hosted customer portal.
          </p>
          <form action="/api/billing/portal" method="post">
            <button
              className="button button-secondary"
              disabled={!stripeConfigured}
              type="submit"
            >
              {stripeConfigured ? "Open billing portal" : "Stripe setup required"}
            </button>
          </form>
        </article>
      </section>
    </>
  );
}
