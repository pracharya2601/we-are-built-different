import Link from "next/link";
import { requireAuthContext } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { ACCOUNT_POLICIES } from "@/lib/accounts";
import { getDb } from "@/db";
import { getWorkspaceAccess } from "@/lib/data";

export default async function DashboardPage() {
  const auth = await requireAuthContext();
  const policy = ACCOUNT_POLICIES[auth.accountType];
  const access = await getWorkspaceAccess(
    getDb(),
    auth.workspaceId,
    companyConfig.entitlements.productAccessKey,
  );

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {companyConfig.company.shortName}
          </span>
          <div>
            <strong>{companyConfig.company.name}</strong>
            <span>Overview</span>
          </div>
        </div>
        <Link className="button button-quiet" href="/api/auth/logout">
          Sign out
        </Link>
      </header>

      <section className="page-heading" aria-label="Overview">
        <p className="kicker">Overview</p>
        <h1>{policy.label} dashboard.</h1>
        <p>
          Your active workspace is the tenant boundary for members, billing,
          funds, settings, and every future core-product record.
        </p>
      </section>

      <section className="metric-grid" aria-label="Next steps">
        {policy.collaborative ? (
          <article className="content-card">
            <p className="kicker">01 · Workspace</p>
            <h2>Create the operating structure</h2>
            <p>
              Create additional team workspaces and add verified users as
              administrators, billing administrators, or members.
            </p>
            <Link className="button button-primary" href="/dashboard/workspaces">
              Manage workspaces and roles
            </Link>
          </article>
        ) : (
          <article className="content-card">
            <p className="kicker">Private workspace</p>
            <h2>No nested roles</h2>
            <p>
              Beneficiary accounts remain single-user so care claims and
              account details stay private.
            </p>
          </article>
        )}

        <article className="content-card">
          <p className="kicker">02 · Granular access</p>
          <h2>Review settings</h2>
          <p>
            Role defaults can be narrowed or extended per member. Denials take
            effect on the next protected request.
          </p>
          <Link className="button button-secondary" href="/dashboard/settings">
            Open settings
          </Link>
        </article>

        <article className="content-card">
          <p className="kicker">03 · Plan</p>
          <h2>
            {access === "inactive" ? "Choose a plan" : `Access is ${access}`}
          </h2>
          <p>
            {auth.accountType === "beneficiary"
              ? "Beneficiaries can choose either Lite or Pro at their own pace."
              : "Subscription state belongs to the workspace and is projected only from verified Stripe webhooks."}
          </p>
          <Link className="button button-secondary" href="/dashboard/billing">
            Billing and plans
          </Link>
        </article>
      </section>
    </>
  );
}
