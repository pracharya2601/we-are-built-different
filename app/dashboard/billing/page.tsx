import Link from "next/link";

import { requireWorkspacePermission } from "@/lib/auth";

const plans = [
  {
    code: "platform-monthly",
    name: "Standard",
    price: "$29",
    interval: "per workspace / month",
    description:
      "The complete control-plane foundation for one product workspace.",
  },
  {
    code: "platform-annual",
    name: "Standard annual",
    price: "$290",
    interval: "per workspace / year",
    description: "Two months included with the same product entitlement.",
  },
];

export default async function BillingPage() {
  await requireWorkspacePermission("billing:manage");
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">BD</span>
          <div>
            <strong>Built Different Labs</strong>
            <span>Billing settings</span>
          </div>
        </div>
        <span className={`status-pill ${stripeConfigured ? "" : "demo"}`}>
          {stripeConfigured ? "Stripe connected" : "Stripe demo"}
        </span>
      </header>

      <section className="page-heading">
        <p className="kicker">Platform subscription</p>
        <h1>Choose the pace.</h1>
        <p>
          Both plans unlock the stable <strong>platform_access</strong>{" "}
          entitlement. Checkout is created server-side from an allowlisted plan
          code.
        </p>
      </section>

      <section className="metric-grid" aria-label="Available plans">
        {plans.map((plan) => (
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
            {stripeConfigured ? (
              <form action="/api/billing/checkout" method="post">
                <input name="planKey" type="hidden" value={plan.code} />
                <button className="button button-primary" type="submit">
                  Continue to Stripe
                </button>
              </form>
            ) : (
              <Link
                className="button button-primary"
                href={`/dashboard/billing/demo?plan=${plan.code}`}
              >
                Preview checkout
              </Link>
            )}
          </article>
        ))}
        <article className="content-card">
          <span className="kicker">Already subscribed?</span>
          <h2 style={{ marginTop: 24 }}>Manage billing</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            Update payment methods, download invoices, or cancel from Stripe’s
            hosted customer portal.
          </p>
          {stripeConfigured ? (
            <form action="/api/billing/portal" method="post">
              <button className="button button-secondary" type="submit">
                Open billing portal
              </button>
            </form>
          ) : (
            <button className="button button-secondary" disabled type="button">
              Connect Stripe first
            </button>
          )}
        </article>
      </section>
    </>
  );
}
