import { getDb } from "@/db";
import {
  WORKSPACE_PERMISSIONS,
  canManageRole,
  effectivePermissions,
  overridesForEffectivePermissions,
  withApiAuth,
  type WorkspacePermission,
} from "@/lib/auth";
import {
  appendAuditLog,
  getWorkspaceMembership,
  listMembershipPermissionOverrides,
  replaceMembershipPermissionOverrides,
} from "@/lib/data";

const PERMISSIONS = new Set<string>(WORKSPACE_PERMISSIONS);

export const GET = withApiAuth(
  async function getMemberPermissions(
    _request: Request,
    context: {
      params: Promise<{ workspaceId: string; userId: string }>;
    },
    auth,
  ) {
    const { workspaceId, userId } = await context.params;
    const boundaryError = validateWorkspaceBoundary(
      workspaceId,
      auth.workspaceId,
    );
    if (boundaryError) return boundaryError;

    const db = getDb();
    const membership = await getWorkspaceMembership(db, userId, workspaceId);
    if (!membership) {
      return error("membership_not_found", "Membership not found.", 404);
    }
    const overrides = await listMembershipPermissionOverrides(
      db,
      workspaceId,
      userId,
    );
    return Response.json(
      {
        workspaceId,
        userId,
        role: membership.role,
        permissions: effectivePermissions([membership.role], overrides),
        overrides,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
  "members:manage",
);

export const PUT = withApiAuth(
  async function replaceMemberPermissions(
    request: Request,
    context: {
      params: Promise<{ workspaceId: string; userId: string }>;
    },
    auth,
  ) {
    const { workspaceId, userId } = await context.params;
    const boundaryError = validateWorkspaceBoundary(
      workspaceId,
      auth.workspaceId,
    );
    if (boundaryError) return boundaryError;

    const body = await readBody(request);
    if (!body || !Array.isArray(body.permissions)) {
      return error(
        "invalid_permissions",
        "permissions must be an array of known permission names.",
        400,
      );
    }
    if (
      body.permissions.some(
        (permission) =>
          typeof permission !== "string" || !PERMISSIONS.has(permission),
      )
    ) {
      return error(
        "invalid_permissions",
        "One or more permissions are not supported.",
        400,
      );
    }
    const desired = [
      ...new Set(body.permissions as WorkspacePermission[]),
    ];
    const db = getDb();
    const target = await getWorkspaceMembership(db, userId, workspaceId);
    if (!target) {
      return error("membership_not_found", "Membership not found.", 404);
    }
    if (userId === auth.userId) {
      return error(
        "cannot_change_own_permissions",
        "Ask another workspace administrator to change your granular access.",
        409,
      );
    }
    if (!desired.includes("workspace:view")) {
      return error(
        "workspace_view_required",
        "Suspend the member to revoke workspace access; active members must retain workspace:view.",
        409,
      );
    }
    const actorRole = auth.roles[0] ?? "member";
    if (!canManageRole(actorRole, target.role, target.role)) {
      return error(
        "permission_assignment_denied",
        "Your role cannot change this member's granular access.",
        403,
      );
    }

    const overrides = overridesForEffectivePermissions(target.role, desired);
    await replaceMembershipPermissionOverrides(db, {
      workspaceId,
      userId,
      overrides,
    });
    await appendAuditLog(db, {
      workspaceId,
      actorType: "user",
      actorId: auth.userId,
      action: "workspace.membership.permissions.updated",
      targetType: "membership",
      targetId: userId,
      metadata: { permissions: desired, overrides },
    });

    return Response.json(
      {
        workspaceId,
        userId,
        role: target.role,
        permissions: effectivePermissions([target.role], overrides),
        overrides,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
  "members:manage",
);

function validateWorkspaceBoundary(
  requestedWorkspaceId: string,
  activeWorkspaceId: string,
): Response | null {
  return requestedWorkspaceId === activeWorkspaceId
    ? null
    : error(
        "workspace_access_denied",
        "Switch to this workspace before managing granular access.",
        403,
      );
}

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
