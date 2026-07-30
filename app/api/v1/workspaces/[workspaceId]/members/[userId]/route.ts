import { getDb } from "@/db";
import {
  WORKSPACE_ROLES,
  canManageRole,
  withApiAuth,
  type WorkspaceRole,
} from "@/lib/auth";
import {
  appendAuditLog,
  countActiveWorkspaceManagers,
  countActiveWorkspaceOwners,
  getWorkspaceMembership,
  updateWorkspaceMembership,
} from "@/lib/data";

const ROLES = new Set<string>(WORKSPACE_ROLES);
const STATUSES = new Set(["active", "suspended"]);

export const PATCH = withApiAuth(
  async function changeWorkspaceMember(
    request: Request,
    context: {
      params: Promise<{ workspaceId: string; userId: string }>;
    },
    auth,
  ) {
    const { workspaceId, userId } = await context.params;
    if (workspaceId !== auth.workspaceId) {
      return error(
        "workspace_access_denied",
        "Switch to this workspace before managing its members.",
        403,
      );
    }
    const body = await readBody(request);
    if (!body) return error("invalid_json", "A JSON body is required.", 400);

    const db = getDb();
    const target = await getWorkspaceMembership(db, userId, workspaceId);
    if (!target) {
      return error("membership_not_found", "Membership not found.", 404);
    }
    const role =
      typeof body.role === "string" && ROLES.has(body.role)
        ? (body.role as WorkspaceRole)
        : target.role;
    const status =
      typeof body.status === "string" && STATUSES.has(body.status)
        ? (body.status as "active" | "suspended")
        : target.status;
    if (status === "invited") {
      return error(
        "invalid_membership_status",
        "Invited memberships cannot be set through this endpoint.",
        400,
      );
    }
    if (
      body.role !== undefined &&
      (typeof body.role !== "string" || !ROLES.has(body.role))
    ) {
      return error("invalid_role", "The workspace role is invalid.", 400);
    }
    if (
      body.status !== undefined &&
      (typeof body.status !== "string" || !STATUSES.has(body.status))
    ) {
      return error(
        "invalid_membership_status",
        "Membership status must be active or suspended.",
        400,
      );
    }

    const actorRole = auth.roles[0] ?? "member";
    if (!canManageRole(actorRole, target.role, role)) {
      return error(
        "role_assignment_denied",
        "Your role cannot make this membership change.",
        403,
      );
    }
    if (userId === auth.userId && status === "suspended") {
      return error(
        "cannot_suspend_self",
        "You cannot suspend your own active membership.",
        409,
      );
    }
    if (userId === auth.userId && role !== target.role) {
      return error(
        "cannot_change_own_role",
        "Ask another workspace administrator to change your role.",
        409,
      );
    }
    const targetIsManager =
      target.role === "owner" || target.role === "admin";
    const nextIsManager =
      status === "active" && (role === "owner" || role === "admin");
    if (
      targetIsManager &&
      target.status === "active" &&
      !nextIsManager &&
      (await countActiveWorkspaceManagers(db, workspaceId)) <= 1
    ) {
      return error(
        "last_workspace_admin_required",
        "Add another active administrator before removing the last workspace administrator.",
        409,
      );
    }
    if (
      target.role === "owner" &&
      target.status === "active" &&
      (role !== "owner" || status !== "active") &&
      (await countActiveWorkspaceOwners(db, workspaceId)) <= 1
    ) {
      return error(
        "last_owner_required",
        "Transfer ownership before changing the last active owner.",
        409,
      );
    }

    const membership = await updateWorkspaceMembership(db, {
      workspaceId,
      userId,
      role,
      status: status as "active" | "suspended",
    });
    if (!membership) {
      return error("membership_not_found", "Membership not found.", 404);
    }
    await appendAuditLog(db, {
      workspaceId,
      actorType: "user",
      actorId: auth.userId,
      action: "workspace.membership.updated",
      targetType: "membership",
      targetId: userId,
      metadata: {
        previousRole: target.role,
        role,
        previousStatus: target.status,
        status,
      },
    });
    return Response.json(
      {
        membership: {
          workspaceId,
          userId,
          role: membership.role,
          status: membership.status,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
  "members:manage",
);

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function error(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
