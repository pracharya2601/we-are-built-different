import Link from "next/link";
import { AuthGuard, DashboardAccessGuard } from "@/lib/auth";
import { getAuthContext } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { getDb } from "@/db";
import {
  bootstrapPlatformOwnerFromVerifiedIdentity,
  isPlatformOwner,
} from "@/lib/data";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard returnTo="/dashboard">
      <DashboardAccessGuard>
        <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" href="/">
            <span className="brand-mark">{companyConfig.company.mark}</span>
            <span>{companyConfig.company.name}</span>
          </Link>
          <nav className="sidebar-nav" aria-label="Workspace navigation">
            <Link href="/dashboard">
              Overview
            </Link>
            <Link href="/dashboard/workspaces">Workspaces & roles</Link>
            <Link href="/dashboard/settings">Settings & access</Link>
            <Link href="/dashboard/finance">Funds & participants</Link>
            <Link href="/appointments/demo-openchair">
              OpenChair workflow
            </Link>
            {companyConfig.features.billing ? (
              <Link href="/dashboard/billing">Billing</Link>
            ) : null}
            <PlatformOwnerCallsLink />
          </nav>
          <div className="sidebar-footer">
            OpenChair operations v0.1
            <br />
            Identity · Funding · Access
          </div>
        </aside>
        <main className="app-main">{children}</main>
        </div>
      </DashboardAccessGuard>
    </AuthGuard>
  );
}

async function PlatformOwnerCallsLink() {
  const auth = await getAuthContext();
  if (!auth) return null;
  const db = getDb();
  await bootstrapPlatformOwnerFromVerifiedIdentity(db, auth.userId);
  if (!(await isPlatformOwner(db, auth.userId))) return null;
  return <Link href="/dashboard/admin/calls">Call automation</Link>;
}
