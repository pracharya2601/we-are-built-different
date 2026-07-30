import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/api/auth/login?returnTo=/dashboard");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">B/D</span>
          <span>Built Different</span>
        </Link>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <Link aria-current="page" href="/dashboard">
            Overview
          </Link>
          <Link href="/dashboard/billing">Billing</Link>
          <Link href="/architecture">Integration</Link>
        </nav>
        <div className="sidebar-footer">
          Control plane v0.1
          <br />
          Auth0 · Stripe · D1
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
