import Link from "next/link";

import { companyConfig } from "@/lib/config";

const flow = [
  {
    number: "01",
    title: "Clinics release openings",
    body: "A canceled appointment becomes a reduced-price opening instead of an empty chair.",
  },
  {
    number: "02",
    title: "Sponsors provide credits",
    body: "Nonprofits, employers, schools, and community partners fund care without public fundraising.",
  },
  {
    number: "03",
    title: "Patients claim privately",
    body: "An eligible person nearby can claim the opening and receive care with dignity.",
  },
];

const signInHref = "/api/auth/login?returnTo=/dashboard";

export default function Home() {
  return (
    <main>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">{companyConfig.company.mark}</span>
          <span>{companyConfig.company.name}</span>
        </Link>
        <div className="nav-actions">
          <a
            className="text-link"
            href="https://www.nidcr.nih.gov/research/oralhealthinamerica/section-1-summary"
            rel="noreferrer"
            target="_blank"
          >
            Why access matters
          </a>
          <Link className="button button-quiet" href={signInHref}>
            Sign in
          </Link>
        </div>
      </nav>

      <section className="shell hero openchair-hero">
        <div className="eyebrow">
          <span className="status-dot" />
          Unused capacity → accessible care
        </div>
        <h1>
          Fill the chair.
          <br />
          <span>Fund the care.</span>
        </h1>
        <p className="hero-copy">
          When a dental clinic gets a last-minute cancellation, OpenChair helps
          release the appointment at a reduced price. A sponsor provides care
          credits, and an eligible patient privately claims the opening.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href={signInHref}>
            Get started
            <span aria-hidden="true">↗</span>
          </Link>
          <a
            className="button button-secondary"
            href="https://www.nidcr.nih.gov/research/oralhealthinamerica/section-1-summary"
            rel="noreferrer"
            target="_blank"
          >
            Read the oral-health evidence
          </a>
        </div>
        <div className="system-strip" aria-label="OpenChair model">
          <div>
            <span>Capacity</span>
            <strong>Canceled appointments</strong>
          </div>
          <div>
            <span>Funding</span>
            <strong>Sponsor-backed care credits</strong>
          </div>
          <div>
            <span>Access</span>
            <strong>Private patient claims</strong>
          </div>
          <div>
            <span>Starting point</span>
            <strong className="accent-text">Dental care</strong>
          </div>
        </div>
      </section>

      <section className="shell problem-solution" aria-label="Problem and solution">
        <article>
          <p className="kicker">The problem</p>
          <h2>One empty chair. Two people losing.</h2>
          <p>
            The clinic loses revenue while someone nearby lives with tooth pain
            but cannot afford treatment or find an appointment. Delayed regular
            care can push people toward more expensive emergency departments
            that often cannot resolve the underlying dental problem.
          </p>
        </article>
        <article className="solution-panel">
          <p className="kicker">The solution</p>
          <h2>Turn the cancellation into care.</h2>
          <p>
            The clinic gets paid instead of losing the slot. The patient
            receives care without asking strangers for money. Sponsors can see
            their credits create real access while patient claims remain
            private.
          </p>
        </article>
      </section>

      <section className="shell pillars" aria-labelledby="openchair-flow-title">
        <div className="section-heading">
          <p className="kicker">How OpenChair works</p>
          <h2 id="openchair-flow-title">
            Release. Fund. Claim.
          </h2>
        </div>
        <div className="pillar-grid">
          {flow.map((item) => (
            <article className="pillar-card" key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
        <div className="vision-band">
          <p className="kicker">The larger vision</p>
          <p>
            Turn unused healthcare capacity into accessible care—starting with
            dental, then expanding to therapy, physiotherapy, diagnostics, and
            other appointments.
          </p>
        </div>
      </section>
    </main>
  );
}
