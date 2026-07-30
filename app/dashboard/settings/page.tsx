import { getDb } from "@/db";
import {
  ROLE_LABELS,
  WORKSPACE_PERMISSIONS,
  effectivePermissions,
  requireWorkspacePermission,
} from "@/lib/auth";
import { ACCOUNT_POLICIES } from "@/lib/accounts";
import {
  getActiveWorkspaceMembership,
  listMembershipPermissionOverrides,
  listWorkspaceMembers,
} from "@/lib/data";

import { AccessSettings } from "./access-settings";

export default async function SettingsPage() {
  const auth = await requireWorkspacePermission("members:manage");
  const db = getDb();
  const workspace = await getActiveWorkspaceMembership(
    db,
    auth.userId,
    auth.workspaceId,
  );
  if (!workspace) return null;

  const policy = ACCOUNT_POLICIES[workspace.accountType];
  const members = policy.collaborative
    ? await listWorkspaceMembers(db, workspace.workspaceId)
    : [];
  const access = await Promise.all(
    members.map(async (member) => {
      const overrides = await listMembershipPermissionOverrides(
        db,
        workspace.workspaceId,
        member.userId,
      );
      return {
        userId: member.userId,
        name: member.displayName || member.email || member.userId,
        email: member.email,
        role: member.role,
        roleLabel: ROLE_LABELS[member.role],
        permissions: effectivePermissions([member.role], overrides),
      };
    }),
  );

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {workspace.workspaceName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{workspace.workspaceName}</strong>
            <span>{policy.label} settings</span>
          </div>
        </div>
      </header>

      <section className="page-heading">
        <p className="kicker">Granular settings</p>
        <h1>Access follows the workspace.</h1>
        <p>
          Roles provide safe defaults. Permission overrides let an
          administrator narrow or extend one member without changing their
          role. Every protected request rechecks these settings in D1.
        </p>
      </section>

      <section className="content-card">
        <p className="kicker">Account policy</p>
        <h2>{policy.label}</h2>
        <p>{policy.description}</p>
        <p>
          {policy.collaborative
            ? "Team workspaces, additional users, and nested roles are enabled."
            : "This is a private single-user account; nested roles are disabled."}
        </p>
      </section>

      {policy.collaborative ? (
        <AccessSettings
          currentUserId={auth.userId}
          permissions={[...WORKSPACE_PERMISSIONS]}
          workspaceId={auth.workspaceId}
          members={access}
        />
      ) : null}
    </>
  );
}
