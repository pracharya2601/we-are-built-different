import Link from "next/link";
import { companyConfig } from "@/lib/config";

const nodes = [
  {
    label: "01 / Authenticate",
    title: "Auth0",
    body: "Proves each person’s identity before OpenChair resolves workspace access.",
  },
  {
    label: "02 / Resolve",
    title: "Workspaces",
    body: "Keeps clinics, sponsors, participant records, and permissions inside a tenant boundary.",
  },
  {
    label: "03 / Record",
    title: "Care funding",
    body: "Separates benefactors, beneficiaries, service providers, and balanced funding records.",
  },
  {
    label: "04 / Verify",
    title: "Payment state",
    body: "Uses signed, idempotent Stripe events before changing subscription or funding state.",
  },
];

export default function ArchitecturePage() {
  const primaryHref = companyConfig.features.authentication
    ? "/api/auth/login?returnTo=/dashboard"
    : "/appointments/demo-openchair";

  return (
    <main>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">{companyConfig.company.mark}</span>
          <span>{companyConfig.company.name}</span>
        </Link>
        <Link
          className="button button-quiet"
          href={primaryHref}
        >
          {companyConfig.features.authentication
            ? "Sign in"
            : "Open preview"}
        </Link>
      </nav>
      <section className="shell hero">
        <div className="eyebrow">
          <span className="status-dot" />
          Current operating foundation
        </div>
        <h1>
          Trust first.
          <br />
          <span>Care follows.</span>
        </h1>
        <p className="hero-copy">
          OpenChair’s current control plane keeps identity, tenant access,
          participant records, and verified payment state together. It does not
          pretend that a marketplace or patient-care product already exists.
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
