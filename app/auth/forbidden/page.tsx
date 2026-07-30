import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="auth-state-shell">
      <section className="content-card auth-state-card">
        <span className="status-pill warning">Access denied</span>
        <p className="kicker">Protected route</p>
        <h1>Your account does not have permission for this page.</h1>
        <p>
          Authentication succeeded, but your role in the active workspace
          does not grant this action.
        </p>
        <Link className="button button-primary" href="/dashboard">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
