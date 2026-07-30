"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Role = "owner" | "admin" | "billing_admin" | "member";
type Workspace = {
  id: string;
  name: string;
  slug: string;
  type: "personal" | "team";
  accountType: "service_provider" | "nonprofit" | "beneficiary";
  role: Role;
  organizationManaged: boolean;
};
type Member = {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: Role;
  status: "invited" | "active" | "suspended";
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  billing_admin: "Billing administrator",
  member: "Member",
};

export function WorkspaceConsole({
  activeWorkspaceId,
  currentUserId,
  canManageMembers,
  canCreateWorkspaces,
  workspaces,
  members,
}: {
  activeWorkspaceId: string;
  currentUserId: string;
  canManageMembers: boolean;
  canCreateWorkspaces: boolean;
  workspaces: Workspace[];
  members: Member[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<Role>("member");
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  async function switchWorkspace(workspaceId: string) {
    setBusyKey(`switch:${workspaceId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/workspaces/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await readResponse(response);
      if (!response.ok) {
        if (
          payload?.error?.code ===
            "organization_reauthentication_required" &&
          typeof payload.loginUrl === "string"
        ) {
          window.location.assign(payload.loginUrl);
          return;
        }
        throw new Error(payload?.error?.message ?? "Workspace switch failed.");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("create");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/workspaces", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Workspace creation failed.");
      }
      const workspaceId = payload.workspace?.id;
      if (!workspaceId) {
        throw new Error("Workspace creation returned an invalid response.");
      }
      await switchWorkspace(workspaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
      setBusyKey(null);
    }
  }

  async function updateMember(
    member: Member,
    update: Partial<Pick<Member, "role" | "status">>,
  ) {
    setBusyKey(`member:${member.userId}`);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(activeWorkspaceId)}/members/${encodeURIComponent(member.userId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        },
      );
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Member update failed.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("add-member");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(activeWorkspaceId)}/members`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: memberEmail, role: memberRole }),
        },
      );
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Member creation failed.");
      }
      setMemberEmail("");
      setMemberRole("member");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      {message ? (
        <p className="form-error workspace-message" role="alert">
          {message}
        </p>
      ) : null}

      <section className="workspace-console-grid">
        <article className="content-card">
          <h2>Your workspaces</h2>
          <div className="workspace-list">
            {workspaces.map((workspace) => {
              const active = workspace.id === activeWorkspaceId;
              return (
                <div className="workspace-row" key={workspace.id}>
                  <div>
                    <strong>{workspace.name}</strong>
                    <span>
                      {workspace.type} · {ROLE_LABELS[workspace.role]}
                      {workspace.organizationManaged
                        ? " · Auth0 organization"
                        : ""}
                    </span>
                  </div>
                  {active ? (
                    <span className="status-pill">Active</span>
                  ) : (
                    <button
                      className="button button-quiet"
                      disabled={busyKey !== null}
                      onClick={() => switchWorkspace(workspace.id)}
                      type="button"
                    >
                      {busyKey === `switch:${workspace.id}`
                        ? "Switching…"
                        : "Switch"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </article>

        {canCreateWorkspaces ? (
        <form className="content-card workspace-create" onSubmit={createWorkspace}>
          <p className="kicker">New tenant</p>
          <h2>Create workspace</h2>
          <label htmlFor="workspace-name">Workspace name</label>
          <input
            id="workspace-name"
            maxLength={80}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme operations"
            required
            value={name}
          />
          <p>
            New workspaces inherit the active account type and start you as
            administrator.
          </p>
          <button
            className="button button-primary"
            disabled={busyKey !== null}
            type="submit"
          >
            {busyKey === "create" ? "Creating…" : "Create and switch"}
          </button>
        </form>
        ) : (
          <article className="content-card">
            <p className="kicker">Private account</p>
            <h2>Single-user workspace</h2>
            <p>Beneficiary accounts do not add users or nested roles.</p>
          </article>
        )}
      </section>

      <section className="content-card members-card">
        <div className="members-heading">
          <div>
            <p className="kicker">Active tenant</p>
            <h2>Members and roles</h2>
          </div>
          {!canManageMembers ? (
            <span className="status-pill warning">View restricted</span>
          ) : null}
        </div>
        {canManageMembers ? (
          <>
            {activeWorkspace?.type === "team" ? (
              <form className="member-add" onSubmit={addMember}>
                <div>
                  <label htmlFor="member-email">Verified account email</label>
                  <input
                    id="member-email"
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    required
                    type="email"
                    value={memberEmail}
                  />
                </div>
                <div>
                  <label htmlFor="member-role">Starting role</label>
                  <select
                    id="member-role"
                    onChange={(event) =>
                      setMemberRole(event.target.value as Role)
                    }
                    value={memberRole}
                  >
                    {Object.entries(ROLE_LABELS)
                      .filter(
                        ([role]) =>
                          role !== "owner" ||
                          activeWorkspace.role === "owner",
                      )
                      .map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                  </select>
                </div>
                <button
                  className="button button-primary"
                  disabled={busyKey !== null}
                  type="submit"
                >
                  {busyKey === "add-member" ? "Adding…" : "Add member"}
                </button>
                <small>
                  The user must have completed one verified Auth0 sign-in.
                  Auth0 Organization members are provisioned automatically.
                </small>
              </form>
            ) : null}
            <div className="member-table">
              {members.map((member) => (
                <div className="member-row" key={member.userId}>
                  <div>
                    <strong>
                      {member.displayName || member.email || member.userId}
                      {member.userId === currentUserId ? " (you)" : ""}
                    </strong>
                    <span>{member.email ?? member.userId}</span>
                  </div>
                  <select
                    aria-label={`Role for ${member.email ?? member.userId}`}
                    disabled={busyKey !== null}
                    onChange={(event) =>
                      updateMember(member, {
                        role: event.target.value as Role,
                      })
                    }
                    value={member.role}
                  >
                    {Object.entries(ROLE_LABELS)
                      .filter(
                        ([role]) =>
                          role !== "owner" ||
                          activeWorkspace?.role === "owner" ||
                          member.role === "owner",
                      )
                      .map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                  </select>
                  <button
                    className="button button-quiet"
                    disabled={
                      busyKey !== null || member.userId === currentUserId
                    }
                    onClick={() =>
                      updateMember(member, {
                        status:
                          member.status === "active" ? "suspended" : "active",
                      })
                    }
                    type="button"
                  >
                    {member.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Only workspace owners and administrators can list members.</p>
          </div>
        )}
      </section>
    </>
  );
}

type ApiPayload = {
  error?: { code?: string; message?: string };
  loginUrl?: string;
  workspace?: { id?: string };
};

async function readResponse(response: Response): Promise<ApiPayload> {
  const value: unknown = await response.json();
  return value && typeof value === "object" ? (value as ApiPayload) : {};
}
