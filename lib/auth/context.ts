import { cookies } from "next/headers";

import { getDb } from "../../db";
import {
  getActiveWorkspaceMembership,
  listMembershipPermissionOverrides,
} from "../data";
import { effectivePermissions } from "./authorization";
import { getAuthConfig } from "./config";
import { readCookie, SESSION_COOKIE } from "./cookies";
import { decodeSession } from "./session";
import {
  AuthError,
  type AuthContext,
  type AuthMode,
  type AuthSession,
  type WorkspacePermission,
} from "./types";

export async function getAuthContext(
  request?: Request,
): Promise<AuthContext | null> {
  const session = await getAuthSession(request);
  if (!session) return null;
  try {
    return await requireCurrentMembership(session);
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) return null;
    throw error;
  }
}

export async function requireAuthContext(
  request?: Request,
): Promise<AuthContext> {
  const session = await getAuthSession(request);
  if (!session) {
    throw new AuthError(
      "authentication_required",
      "Authentication is required.",
    );
  }
  return requireCurrentMembership(session);
}

export async function requireWorkspacePermission(
  permission: WorkspacePermission,
  request?: Request,
): Promise<AuthContext> {
  const session = await getAuthSession(request);
  if (!session) {
    throw new AuthError(
      "authentication_required",
      "Authentication is required.",
    );
  }
  const context = await requireCurrentMembership(session);
  const allowed = context.permissions.includes(permission);
  if (!allowed) {
    throw new AuthError(
      "permission_denied",
      `The ${permission} workspace permission is required.`,
      403,
    );
  }
  return context;
}

export async function getAuthMode(request?: Request): Promise<AuthMode> {
  const session = await getAuthSession(request);
  return session?.mode ?? getAuthConfig(request?.url).mode;
}

export async function getAuthSession(
  request?: Request,
): Promise<AuthSession | null> {
  const cookieValue = request
    ? readCookie(request.headers.get("cookie"), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (!cookieValue) return null;
  return decodeSession(cookieValue, request?.url);
}

function publicContext(session: AuthSession): AuthContext {
  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    accountType: session.accountType,
    subject: session.subject,
    email: session.email,
    roles: [...session.roles],
    permissions: [...session.permissions],
    tokenRoles: [...session.tokenRoles],
    tokenPermissions: [...session.tokenPermissions],
    signInIntent: session.signInIntent ?? null,
  };
}

async function requireCurrentMembership(
  session: AuthSession,
): Promise<AuthContext> {
  const membership = await getActiveWorkspaceMembership(
    getDb(),
    session.userId,
    session.workspaceId,
  );
  if (!membership) {
    throw new AuthError(
      "membership_required",
      "An active workspace membership is required.",
      403,
    );
  }
  const overrides = await listMembershipPermissionOverrides(
    getDb(),
    session.workspaceId,
    session.userId,
  );
  return {
    ...publicContext(session),
    accountType: membership.accountType,
    roles: [membership.role],
    permissions: effectivePermissions([membership.role], overrides),
  };
}
