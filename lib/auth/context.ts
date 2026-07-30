import { cookies } from "next/headers";

import { getAuthConfig } from "./config";
import { readCookie, SESSION_COOKIE } from "./cookies";
import { decodeSession } from "./session";
import {
  AuthError,
  type AuthContext,
  type AuthMode,
  type AuthSession,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./types";

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly string[]> = {
  owner: ["*"],
  admin: ["billing:manage", "members:manage", "product:use"],
  billing_admin: ["billing:manage", "product:use"],
  member: ["product:use"],
};

export async function getAuthContext(
  request?: Request,
): Promise<AuthContext | null> {
  const session = await getAuthSession(request);
  if (!session) return null;
  return publicContext(session);
}

export async function requireAuthContext(
  request?: Request,
): Promise<AuthContext> {
  const context = await getAuthContext(request);
  if (!context) {
    throw new AuthError(
      "authentication_required",
      "Authentication is required.",
    );
  }
  return context;
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
  const allowed =
    session.permissions.includes(permission) ||
    session.roles.some((role) => {
      const permissions = ROLE_PERMISSIONS[role] ?? [];
      return permissions.includes("*") || permissions.includes(permission);
    });
  if (!allowed) {
    throw new AuthError(
      "permission_denied",
      `The ${permission} workspace permission is required.`,
      403,
    );
  }
  return publicContext(session);
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
    subject: session.subject,
    email: session.email,
    roles: [...session.roles],
  };
}
