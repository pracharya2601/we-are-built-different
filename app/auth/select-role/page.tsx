import Link from "next/link";

import { safeReturnTo } from "@/lib/auth";
import { companyConfig } from "@/lib/config";

const paths = [
  {
    intent: "service_provider",
    eyebrow: "I provide care",
    title: "Service provider",
    description:
      "I represent a dental clinic or care team with appointment capacity to share.",
    marker: "01",
  },
  {
    intent: "nonprofit",
    eyebrow: "I fund care",
    title: "Nonprofit or sponsor",
    description:
      "I represent a nonprofit, employer, school, or community sponsor providing care credits.",
    marker: "02",
  },
  {
    intent: "beneficiary",
    eyebrow: "I receive care",
    title: "Beneficiary",
    description:
      "I want to privately claim eligible care and choose the plan that fits me.",
    marker: "03",
  },
] as const;

export default async function SelectRolePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);

  return (
    <main className="role-select-shell">
      <nav className="shell nav" aria-label="Authentication navigation">
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
          <p className="kicker">Before you sign in</p>
          <h1>How do you want to open a chair?</h1>
          <p>
            Choose the path closest to your role today. This personalizes your
            account workflow. Verified token claims and workspace policy still
            control permissions.
          </p>
        </div>

        <div className="role-select-grid">
          {paths.map((path) => {
            const loginParams = new URLSearchParams({
              returnTo,
              intent: path.intent,
              force: "1",
            });
            return (
              <Link
                className="role-choice-card"
                href={`/api/auth/login?${loginParams.toString()}`}
                key={path.intent}
              >
                <span className="role-choice-number">{path.marker}</span>
                <span className="role-choice-eyebrow">{path.eyebrow}</span>
                <strong>{path.title}</strong>
                <p>{path.description}</p>
                <span className="role-choice-action">
                  Continue to secure sign in
                  <span aria-hidden="true">↗</span>
                </span>
              </Link>
            );
          })}
        </div>

        <p className="role-select-note">
          Service providers and nonprofits can create team workspaces with
          nested roles. Beneficiary accounts remain private and single-user.
        </p>
      </section>
    </main>
  );
}
