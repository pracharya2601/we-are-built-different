import Link from "next/link";

import {
  describeAuthFailure,
  normalizeAuthFailureCode,
  safeReturnTo,
} from "@/lib/auth";
import { companyConfig } from "@/lib/config";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const failure = describeAuthFailure(params.code);
  // Our own failure code, filtered through the known-code allowlist. The
  // provider's description of the error is never read here: it is
  // attacker-influenceable text and belongs only in the server log.
  const code = normalizeAuthFailureCode(params.code);
  const retryHref = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="auth-state-shell">
      <section className="content-card auth-state-card">
        <span className="status-pill warning">Sign-in failed</span>
        <p className="kicker">Auth0 connection</p>
        <h1>{failure.title}</h1>
        <p>{failure.detail}</p>
        {code ? (
          <ul className="config-list">
            <li>
              <code>{code}</code>
            </li>
          </ul>
        ) : null}
        <div className="hero-actions">
          {failure.retryable ? (
            <Link className="button button-primary" href={retryHref}>
              Try signing in again
            </Link>
          ) : null}
          <Link className="button button-secondary" href="/">
            Return home
          </Link>
        </div>
        <small>{companyConfig.company.name} · fail-closed authentication</small>
      </section>
    </main>
  );
}
