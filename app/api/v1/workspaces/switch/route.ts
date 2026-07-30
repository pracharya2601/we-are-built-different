import { getDb } from "@/db";
import {
  effectivePermissions,
  getAuthSession,
  withApiAuth,
} from "@/lib/auth";
import {
  serializeCookie,
  SESSION_COOKIE,
} from "@/lib/auth/cookies";
import { encodeSession } from "@/lib/auth/session";
import {
  appendAuditLog,
  getActiveWorkspaceMembership,
  listMembershipPermissionOverrides,
} from "@/lib/data";

export const POST = withApiAuth(async function switchWorkspace(
  request,
  _context,
  auth,
) {
  const body = await readBody(request);
  const workspaceId =
    typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!/^wsp_[a-f0-9]{32}$/u.test(workspaceId)) {
    return error("invalid_workspace", "A valid workspace ID is required.", 400);
  }

  const session = await getAuthSession(request);
  if (!session) {
    return error("authentication_required", "Authentication is required.", 401);
  }
  const db = getDb();
  const membership = await getActiveWorkspaceMembership(
    db,
    auth.userId,
    workspaceId,
  );
  if (!membership) {
    return error(
      "workspace_access_denied",
      "You do not have an active membership in that workspace.",
      403,
    );
  }
  if (
    membership.auth0OrganizationId &&
    membership.auth0OrganizationId !== session.organizationId
  ) {
    const returnTo = "/dashboard/workspaces";
    const loginUrl =
      `/api/auth/login?force=1&organization=${encodeURIComponent(membership.auth0OrganizationId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
    return Response.json(
      {
        error: {
          code: "organization_reauthentication_required",
          message: "Sign in through this workspace's Auth0 organization.",
        },
        loginUrl,
      },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const overrides = await listMembershipPermissionOverrides(
    db,
    workspaceId,
    auth.userId,
  );
  const nextSession = {
    ...session,
    workspaceId,
    accountType: membership.accountType,
    roles: [membership.role],
    permissions: effectivePermissions([membership.role], overrides),
    issuedAt: now,
  };
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append(
    "set-cookie",
    serializeCookie(
      SESSION_COOKIE,
      await encodeSession(nextSession, request.url),
      { maxAge: Math.max(0, nextSession.expiresAt - now) },
    ),
  );
  await appendAuditLog(db, {
    workspaceId,
    actorType: "user",
    actorId: auth.userId,
    action: "workspace.switched",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { previousWorkspaceId: auth.workspaceId },
  });
  return Response.json(
    {
      activeWorkspace: {
        id: workspaceId,
        name: membership.workspaceName,
        type: membership.workspaceType,
        accountType: membership.accountType,
        role: membership.role,
      },
    },
    { headers },
  );
});

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
