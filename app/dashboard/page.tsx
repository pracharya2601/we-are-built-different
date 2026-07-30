import Link from "next/link";
import { requireAuthContext } from "@/lib/auth";

const demoMode = !process.env.AUTH0_DOMAIN || !process.env.STRIPE_SECRET_KEY;

export default async function DashboardPage() {
  const auth = await requireAuthContext();

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">BD</span>
          <div>
            <strong>Built Different Labs</strong>
            <span>Personal workspace</span>
          </div>
        </div>
        <Link className="button button-quiet" href="/api/auth/logout">
          Sign out
        </Link>
      </header>

      <section className="page-heading">
        <p className="kicker">Workspace overview</p>
        <h1>The control plane is online.</h1>
        <p>
          Identity, subscription state, and the future product contract meet
          here. Provider configuration can be connected without changing the
          product-facing IDs.
        </p>
      </section>

      <section className="metric-grid" aria-label="Workspace status">
        <article className="metric-card">
          <div className="metric-heading">
            <span>Identity</span>
            <i className={`metric-indicator ${demoMode ? "" : "live"}`} />
          </div>
          <strong>{demoMode ? "Demo session" : "Auth0 connected"}</strong>
        </article>
        <article className="metric-card">
          <div className="metric-heading">
            <span>Subscription</span>
            <i className="metric-indicator" />
          </div>
          <strong>Not subscribed</strong>
        </article>
        <article className="metric-card">
          <div className="metric-heading">
            <span>Product access</span>
            <i className="metric-indicator" />
          </div>
          <strong>Inactive</strong>
        </article>
      </section>

      <section className="content-grid">
        <article className="content-card">
          <h2>Subscription</h2>
          <div className="billing-row">
            <div>
              <span>Current plan</span>
              <strong>No active plan</strong>
            </div>
            <span className={`status-pill ${demoMode ? "demo" : ""}`}>
              {demoMode ? "Demo mode" : "Inactive"}
            </span>
          </div>
          <div className="billing-row">
            <div>
              <span>Product entitlement</span>
              <strong>platform_access</strong>
            </div>
            <Link className="button button-primary" href="/dashboard/billing">
              Choose a plan
            </Link>
          </div>
        </article>

        <article className="content-card">
          <h2>Workspace identity</h2>
          <dl className="detail-list">
            <div>
              <dt>Workspace</dt>
              <dd>{auth.workspaceId}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{auth.roles.join(", ")}</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd>v1</dd>
            </div>
          </dl>
        </article>
      </section>
    </>
  );
}
