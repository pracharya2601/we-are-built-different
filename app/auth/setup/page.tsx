import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAuthConfigurationStatus,
  normalizeSignInIntent,
  safeReturnTo,
} from "@/lib/auth";
import { companyConfig } from "@/lib/config";

export default async function AuthSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const signInIntent = normalizeSignInIntent(params.intent);
  const status = getAuthConfigurationStatus();
  if (status.configured) {
    const loginParams = new URLSearchParams({ returnTo });
    if (signInIntent) loginParams.set("intent", signInIntent);
    redirect(
      `/api/auth/login?${loginParams.toString()}`,
    );
  }

  return (
    <main className="auth-state-shell">
      <section className="content-card auth-state-card">
        <span className="status-pill warning">Configuration required</span>
        <p className="kicker">Auth0 connection</p>
        <h1>Authentication is protected, but not connected yet.</h1>
        <p>
          Add the missing values to <strong>.env.local</strong>, then restart
          the localhost server. Secrets stay outside source control.
        </p>
        <ul className="config-list">
          {status.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/">
            Return home
          </Link>
          <Link className="button button-primary" href="/architecture">
            Review auth flow
          </Link>
        </div>
        <small>{companyConfig.company.name} · fail-closed authentication</small>
      </section>
    </main>
  );
}
