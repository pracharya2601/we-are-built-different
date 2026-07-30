import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  requireWorkspacePermission,
} from "./context";
import { requireAuthContext } from "./context";
import { ACCOUNT_POLICIES } from "../accounts";
import { getDb } from "../../db";
import { getWorkspaceAccess } from "../data";
import { companyConfig } from "../config";
import {
  authSetupPath,
  getAuthConfigurationStatus,
} from "./config";
import { safeReturnTo } from "./flow";
import {
  AuthError,
  type AuthContext,
  type WorkspacePermission,
} from "./types";
import { requirePlatformOwner } from "./platform";

type RouteHandler<TContext> = (
  request: Request,
  context: TContext,
  auth: AuthContext,
) => Promise<Response>;

/**
 * Turns an AuthError into the right redirect. Never returns: every branch
 * either redirects or rethrows.
 */
function redirectForAuthError(error: unknown, safeDestination: string): never {
  if (!(error instanceof AuthError)) throw error;

  const loginUrl = (force = false) =>
    `/api/auth/login?returnTo=${encodeURIComponent(safeDestination)}${
      force ? "&force=1" : ""
    }`;

  if (error.code === "authentication_required") redirect(loginUrl());

  // A signed session naming a workspace the user is no longer an active member
  // of is stale, not forbidden -- it happens when a workspace is deleted or the
  // local database is reset while a session cookie is still live. Sending it to
  // /auth/forbidden strands the user on a page whose only link returns here.
  // Re-authenticating re-resolves the workspace from D1 and issues a fresh
  // session; force=1 is required because the stale cookie would otherwise
  // short-circuit the login route.
  if (error.code === "membership_required") redirect(loginUrl(true));

  if (error.status === 403) redirect("/auth/forbidden");
  throw error;
}

export async function AuthGuard({
  children,
  permission,
  returnTo = "/dashboard",
}: {
  children: ReactNode;
  permission?: WorkspacePermission;
  returnTo?: string;
}) {
  const safeDestination = safeReturnTo(returnTo);
  const status = getAuthConfigurationStatus();
  if (!status.configured) {
    redirect(authSetupPath(safeDestination));
  }

  try {
    await requireWorkspacePermission(permission ?? "workspace:view");
    return children;
  } catch (error) {
    redirectForAuthError(error, safeDestination);
  }
}

export async function DashboardAccessGuard({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await requireAuthContext();
  const policy = ACCOUNT_POLICIES[auth.accountType];
  if (!policy.dashboardRequiresSubscription) return children;

  const access = await getWorkspaceAccess(
    getDb(),
    auth.workspaceId,
    companyConfig.entitlements.productAccessKey,
  );
  if (!["active", "trialing", "grace"].includes(access)) {
    redirect("/onboarding/subscription");
  }
  return children;
}

export function withApiAuth<TContext>(
  handler: RouteHandler<TContext>,
  permission?: WorkspacePermission,
) {
  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      const auth = permission
        ? await requireWorkspacePermission(permission, request)
        : await requireWorkspacePermission("workspace:view", request);
      return handler(request, context, auth);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          {
            status: error.status,
            headers: { "cache-control": "no-store" },
          },
        );
      }
      throw error;
    }
  };
}

export function withPlatformOwner<TContext>(
  handler: RouteHandler<TContext>,
) {
  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      const auth = await requirePlatformOwner(request);
      return handler(request, context, auth);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          {
            status: error.status,
            headers: { "cache-control": "no-store" },
          },
        );
      }
      throw error;
    }
  };
}
