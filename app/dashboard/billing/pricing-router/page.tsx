import Link from "next/link";

import { requireWorkspacePermission } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/billing";
import { companyConfig } from "@/lib/config";

import { DynamicCheckoutForm } from "./dynamic-checkout-form";

export default async function PricingRouterPage() {
  await requireWorkspacePermission("billing:manage");
  const stripeConfigured = isStripeConfigured();

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {companyConfig.company.shortName}
          </span>
          <div>
            <strong>{companyConfig.company.name}</strong>
            <span>Dynamic pricing router</span>
          </div>
        </div>
        <Link className="button button-quiet" href="/dashboard/billing">
          Back to billing
        </Link>
      </header>

      <section className="page-heading pricing-router-heading">
        <p className="kicker">Real Stripe checkout</p>
        <h1>Route any approved amount.</h1>
        <p>
          Choose a server-allowlisted service and a monthly amount. This page
          calls the same versioned API that future OpenChair workflows can use.
        </p>
      </section>

      <DynamicCheckoutForm stripeConfigured={stripeConfigured} />

      <section className="router-flow" aria-label="Checkout processing flow">
        <article>
          <span>01</span>
          <strong>Request</strong>
          <p>The product and integer-cent amount enter the versioned route.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Validate</strong>
          <p>The server enforces product, currency, amount, and permissions.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Checkout</strong>
          <p>Stripe hosts payment collection with an inline monthly price.</p>
        </article>
        <article>
          <span>04</span>
          <strong>Activate</strong>
          <p>A signed webhook updates the local subscription entitlement.</p>
        </article>
      </section>
    </>
  );
}
