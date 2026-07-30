import { getDb } from "@/db";
import {
  ACCOUNT_POLICIES,
} from "@/lib/accounts";
import {
  WORKSPACE_ROLES,
  canManageRole,
  withApiAuth,
  type WorkspaceRole,
} from "@/lib/auth";
import {
  appendAuditLog,
  createWorkspaceMembership,
  findVerifiedUserByEmail,
  getActiveWorkspaceMembership,
  getWorkspaceMembership,
  listWorkspaceMembers,
} from "@/lib/data";

export const GET = withApiAuth(
  async function getWorkspaceMembers(
    _request: Request,
    context: { params: Promise<{ workspaceId: string }> },
    auth,
  ) {
    const { workspaceId } = await context.params;
    if (workspaceId !== auth.workspaceId) {
      return Response.json(
        {
          error: {
            code: "workspace_access_denied",
            message: "Switch to this workspace before managing its members.",
          },
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const members = await listWorkspaceMembers(getDb(), workspaceId);
    return Response.json(
      { workspaceId, members },
      { headers: { "cache-control": "no-store" } },
    );
  },
  "members:manage",
);

export const POST = withApiAuth(
  async function addWorkspaceMember(
    request: Request,
    context: { params: Promise<{ workspaceId: string }> },
    auth,
  ) {
    const { workspaceId } = await context.params;
    if (workspaceId !== auth.workspaceId) {
      return error(
        "workspace_access_denied",
        "Switch to this workspace before managing its members.",
        403,
      );
    }
    const body = await readBody(request);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const role =
      typeof body?.role === "string" &&
      new Set<string>(WORKSPACE_ROLES).has(body.role)
        ? (body.role as WorkspaceRole)
        : "member";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email) || email.length > 254) {
      return error("invalid_email", "A valid email address is required.", 400);
    }
    const actorRole = auth.roles[0] ?? "member";
    if (!canManageRole(actorRole, "member", role)) {
      return error(
        "role_assignment_denied",
        "Your role cannot assign the requested role.",
        403,
      );
    }

    const db = getDb();
    const activeWorkspace = await getActiveWorkspaceMembership(
      db,
      auth.userId,
      workspaceId,
    );
    if (activeWorkspace?.workspaceType === "personal") {
      return error(
        "personal_workspace_members",
        "Personal workspaces cannot have additional members.",
        409,
      );
    }
    if (
      !activeWorkspace ||
      !ACCOUNT_POLICIES[activeWorkspace.accountType].collaborative
    ) {
      return error(
        "nested_roles_not_supported",
        "This account type does not support additional users or nested roles.",
        409,
      );
    }
    const user = await findVerifiedUserByEmail(db, email);
    if (!user) {
      return error(
        "verified_user_not_found",
        "No unique verified account exists for this email. Ask the user to sign in once, then retry.",
        404,
      );
    }
    if (await getWorkspaceMembership(db, user.userId, workspaceId)) {
      return error(
        "membership_exists",
        "This user already has a workspace membership.",
        409,
      );
    }
    const membership = await createWorkspaceMembership(db, {
      workspaceId,
      userId: user.userId,
      role,
      invitedByUserId: auth.userId,
    });
    if (!membership) {
      return error(
        "membership_creation_failed",
        "The workspace membership could not be created.",
        500,
      );
    }
    await appendAuditLog(db, {
      workspaceId,
      actorType: "user",
      actorId: auth.userId,
      action: "workspace.membership.created",
      targetType: "membership",
      targetId: user.userId,
      metadata: { role },
    });
    return Response.json(
      {
        membership: {
          workspaceId,
          userId: user.userId,
          email: user.email,
          role: membership.role,
          status: membership.status,
        },
      },
      { status: 201, headers: { "cache-control": "no-store" } },
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
