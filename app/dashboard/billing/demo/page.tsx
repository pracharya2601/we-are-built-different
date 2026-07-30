import Link from "next/link";

const planLabels: Record<string, string> = {
  "platform-monthly": "Standard monthly · $29",
  "platform-annual": "Standard annual · $290",
};

export default async function DemoCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan = "platform-monthly" } = await searchParams;
  const planLabel = planLabels[plan] ?? planLabels["platform-monthly"];

  return (
    <div className="content-card" style={{ maxWidth: 680, margin: "8vh auto" }}>
      <span className="status-pill demo">Demo only</span>
      <p className="kicker" style={{ marginTop: 30 }}>
        Checkout preview
      </p>
      <h1 style={{ fontSize: "3rem", letterSpacing: "-0.05em" }}>
        {planLabel}
      </h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        No payment was created and no entitlement was granted. When Stripe
        sandbox credentials and allowlisted Price IDs are configured, this
        action redirects to a real Stripe-hosted Checkout Session.
      </p>
      <div className="hero-actions">
        <Link className="button button-primary" href="/dashboard/billing">
          Back to plans
        </Link>
        <Link className="button button-secondary" href="/architecture">
          Review the integration
        </Link>
      </div>
    </div>
  );
}
