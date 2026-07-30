import Link from "next/link";

export default function BillingReturnPage() {
  return (
    <div className="content-card" style={{ maxWidth: 680, margin: "16vh auto" }}>
      <p className="kicker">Checkout returned</p>
      <h1 style={{ fontSize: "3rem", letterSpacing: "-0.05em" }}>
        We’re confirming the subscription.
      </h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        Access is granted only after a verified Stripe webhook updates the local
        entitlement. Refreshing or editing this URL cannot activate a product.
      </p>
      <Link className="button button-primary" href="/dashboard">
        Return to overview
      </Link>
    </div>
  );
}
