import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  requireAuthContext,
} from "@/lib/auth";
import { getDb } from "@/db";
import {
  getActiveMembershipsForUser,
  listWorkspaceMembers,
} from "@/lib/data";
import { WorkspaceConsole } from "./workspace-console";
import { ACCOUNT_POLICIES } from "@/lib/accounts";

export default async function WorkspacesPage() {
  const auth = await requireAuthContext();
  const db = getDb();
  const workspaces = await getActiveMembershipsForUser(db, auth.userId);
  const active = workspaces.find(
    (workspace) => workspace.workspaceId === auth.workspaceId,
  );
  const canManageMembers = auth.permissions.includes("members:manage");
  const members = canManageMembers
    ? await listWorkspaceMembers(db, auth.workspaceId)
    : [];
  const canCreateWorkspaces = active
    ? ACCOUNT_POLICIES[active.accountType].collaborative
    : false;

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {active?.workspaceName.slice(0, 2).toUpperCase() ?? "WS"}
          </span>
          <div>
            <strong>{active?.workspaceName ?? "Workspace"}</strong>
            <span>
              {active?.workspaceType === "personal" ? "Personal" : "Team"} ·{" "}
              {ROLE_LABELS[active?.role ?? "member"]}
            </span>
          </div>
        </div>
        <a className="button button-quiet" href="/api/auth/logout">
          Sign out
        </a>
      </header>

      <section className="page-heading workspace-heading">
        <p className="kicker">Tenant control</p>
        <h1>Workspaces and roles.</h1>
        <p>
          Auth0 verifies who signed in. Workspace membership decides which
          tenant they can access and what they can do inside it.
        </p>
      </section>

      <WorkspaceConsole
        activeWorkspaceId={auth.workspaceId}
        currentUserId={auth.userId}
        canManageMembers={canManageMembers}
        canCreateWorkspaces={canCreateWorkspaces}
        workspaces={workspaces.map((workspace) => ({
          id: workspace.workspaceId,
          name: workspace.workspaceName,
          slug: workspace.workspaceSlug,
          type: workspace.workspaceType,
          accountType: workspace.accountType,
          role: workspace.role,
          organizationManaged: Boolean(workspace.auth0OrganizationId),
        }))}
        members={members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          status: member.status,
        }))}
      />

      <section className="content-card role-matrix">
        <div>
          <p className="kicker">Authorization policy</p>
          <h2>Role permissions</h2>
        </div>
        <div className="role-grid">
          {Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => (
            <article key={role}>
              <strong>{ROLE_LABELS[role as keyof typeof ROLE_LABELS]}</strong>
              <span>{permissions.join(" · ")}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
