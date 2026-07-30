import Link from "next/link";

const pillars = [
  {
    number: "01",
    title: "Identity that travels",
    body: "One account and workspace model across the control plane and every product you add later.",
  },
  {
    number: "02",
    title: "Billing that stays accurate",
    body: "Stripe events become a durable entitlement projection instead of fragile redirect logic.",
  },
  {
    number: "03",
    title: "A clean product contract",
    body: "Your core product consumes stable IDs, permissions, and feature access—not vendor internals.",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">B/D</span>
          <span>Built Different</span>
        </Link>
        <div className="nav-actions">
          <Link className="text-link" href="/architecture">
            Architecture
          </Link>
          <Link
            className="button button-quiet"
            href="/api/auth/login?returnTo=/dashboard"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <section className="shell hero">
        <div className="eyebrow">
          <span className="status-dot" />
          SaaS control plane
        </div>
        <h1>
          Build the product.
          <br />
          <span>We’ll protect the doorway.</span>
        </h1>
        <p className="hero-copy">
          Production-shaped authentication, workspace access, subscriptions,
          and entitlements—ready before the core product arrives.
        </p>
        <div className="hero-actions">
          <Link
            className="button button-primary"
            href="/api/auth/login?returnTo=/dashboard"
          >
            Enter the control plane
            <span aria-hidden="true">↗</span>
          </Link>
          <Link className="button button-secondary" href="/architecture">
            See how it connects
          </Link>
        </div>
        <div className="system-strip" aria-label="Platform status">
          <div>
            <span>Identity</span>
            <strong>Auth0</strong>
          </div>
          <div>
            <span>Billing</span>
            <strong>Stripe</strong>
          </div>
          <div>
            <span>Access model</span>
            <strong>Workspace entitlements</strong>
          </div>
          <div>
            <span>Product state</span>
            <strong className="accent-text">Ready to connect</strong>
          </div>
        </div>
      </section>

      <section className="shell pillars" aria-labelledby="foundation-title">
        <div className="section-heading">
          <p className="kicker">Foundation, not lock-in</p>
          <h2 id="foundation-title">The durable layer beneath every product.</h2>
        </div>
        <div className="pillar-grid">
          {pillars.map((pillar) => (
            <article className="pillar-card" key={pillar.number}>
              <span>{pillar.number}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
