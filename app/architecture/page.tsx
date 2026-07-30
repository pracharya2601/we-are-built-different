import Link from "next/link";

const nodes = [
  {
    label: "01 / Authenticate",
    title: "Auth0",
    body: "Proves identity and issues an organization-scoped token for the product API.",
  },
  {
    label: "02 / Resolve",
    title: "Control plane",
    body: "Maps provider identity to stable users, workspaces, roles, and current access.",
  },
  {
    label: "03 / Project",
    title: "Entitlements",
    body: "Turns asynchronous Stripe state into fast, durable product permissions.",
  },
  {
    label: "04 / Consume",
    title: "Core product",
    body: "Uses the stable contract without handling billing vendors or identity administration.",
  },
];

export default function ArchitecturePage() {
  return (
    <main>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">B/D</span>
          <span>Built Different</span>
        </Link>
        <Link
          className="button button-quiet"
          href="/api/auth/login?returnTo=/dashboard"
        >
          Sign in
        </Link>
      </nav>
      <section className="shell hero">
        <div className="eyebrow">
          <span className="status-dot" />
          Integration contract
        </div>
        <h1>
          One doorway.
          <br />
          <span>Any product behind it.</span>
        </h1>
        <p className="hero-copy">
          Authentication, authorization, and payment state stay in the control
          plane. Product teams receive a small, versioned contract.
        </p>
        <div className="architecture-grid">
          {nodes.map((node) => (
            <article className="architecture-node" key={node.label}>
              <span>{node.label}</span>
              <h2>{node.title}</h2>
              <p>{node.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
