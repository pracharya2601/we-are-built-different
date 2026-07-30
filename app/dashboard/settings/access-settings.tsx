"use client";

import { useState } from "react";

type Permission =
  | "workspace:view"
  | "workspace:manage"
  | "billing:manage"
  | "funds:view"
  | "funds:manage"
  | "members:manage"
  | "product:use";

type MemberAccess = {
  userId: string;
  name: string;
  email: string | null;
  role: "owner" | "admin" | "billing_admin" | "member";
  roleLabel: string;
  permissions: Permission[];
};

export function AccessSettings({
  workspaceId,
  currentUserId,
  permissions,
  members,
}: {
  workspaceId: string;
  currentUserId: string;
  permissions: Permission[];
  members: MemberAccess[];
}) {
  const [values, setValues] = useState<Record<string, Permission[]>>(
    Object.fromEntries(
      members.map((member) => [member.userId, member.permissions]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(userId: string, permission: Permission) {
    setValues((current) => {
      const selected = new Set(current[userId] ?? []);
      if (selected.has(permission)) selected.delete(permission);
      else selected.add(permission);
      return { ...current, [userId]: permissions.filter((p) => selected.has(p)) };
    });
  }

  async function save(member: MemberAccess) {
    setBusy(member.userId);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(member.userId)}/permissions`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ permissions: values[member.userId] ?? [] }),
        },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
        permissions?: Permission[];
      };
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "Permission update failed.",
        );
      }
      setValues((current) => ({
        ...current,
        [member.userId]: payload.permissions ?? [],
      }));
      setMessage(`Saved access for ${member.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="content-card members-card">
      <div className="members-heading">
        <div>
          <p className="kicker">Permission overrides</p>
          <h2>Member access</h2>
        </div>
        {message ? <span className="status-pill">{message}</span> : null}
      </div>
      <div className="role-grid">
        {members.map((member) => (
          <article key={member.userId}>
            <strong>
              {member.name}
              {member.userId === currentUserId ? " (you)" : ""}
            </strong>
            <span>
              {member.roleLabel}
              {member.email ? ` · ${member.email}` : ""}
            </span>
            <div className="permission-checklist">
              {permissions.map((permission) => (
                <label key={permission}>
                  <input
                    checked={(values[member.userId] ?? []).includes(permission)}
                    disabled={
                      busy !== null ||
                      member.role === "owner" ||
                      member.userId === currentUserId ||
                      permission === "workspace:view"
                    }
                    onChange={() => toggle(member.userId, permission)}
                    type="checkbox"
                  />
                  {permission}
                </label>
              ))}
            </div>
            <button
              className="button button-secondary"
              disabled={
                busy !== null ||
                member.role === "owner" ||
                member.userId === currentUserId
              }
              onClick={() => save(member)}
              type="button"
            >
              {busy === member.userId ? "Saving…" : "Save access"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
