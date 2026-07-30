import Link from "next/link";
import { redirect } from "next/navigation";

import {
  isLocalAuthEnabled,
  LOCAL_AUTH_PERSONAS,
  safeReturnTo,
} from "@/lib/auth";
import { companyConfig } from "@/lib/config";

export default async function SelectRolePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  if (!isLocalAuthEnabled()) {
    redirect(
      `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return (
    <main className="role-select-shell">
      <nav className="shell nav" aria-label="Local user navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">{companyConfig.company.mark}</span>
          <span>{companyConfig.company.name}</span>
        </Link>
        <Link className="text-link" href="/">
          Back home
        </Link>
      </nav>

      <section className="shell role-select">
        <div className="role-select-heading">
          <p className="kicker">Local development access</p>
          <h1>Choose one of three users.</h1>
          <p>
            Auth0 is disabled only for this localhost runtime. Each choice
            creates or reuses a real local D1 user, workspace, and membership
            so permission and tenant checks continue to run.
          </p>
        </div>

        <div className="role-select-grid">
          {LOCAL_AUTH_PERSONAS.map((persona) => (
            <form
              action={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
              key={persona.id}
              method="post"
            >
              <input name="persona" type="hidden" value={persona.id} />
              <button className="role-choice-card" type="submit">
                <span className="role-choice-number">{persona.marker}</span>
                <span className="role-choice-eyebrow">{persona.eyebrow}</span>
                <strong>{persona.title}</strong>
                <p>{persona.description}</p>
                <span className="role-choice-action">
                  Continue as {persona.displayName}
                  <span aria-hidden="true">↗</span>
                </span>
              </button>
            </form>
          ))}
        </div>

        <p className="role-select-note">
          Staging and production do not inherit this mode. They remain
          fail-closed and require a valid Auth0 session.
        </p>
      </section>
    </main>
  );
}
