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
import { isLocalAuthEnabled } from "./local";
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
  if (!isLocalAuthEnabled() && !status.configured) {
    redirect(authSetupPath(safeDestination));
  }

  if (!permission) {
    try {
      await requireWorkspacePermission("workspace:view");
      return children;
    } catch (error) {
      if (
        error instanceof AuthError &&
        error.code === "authentication_required"
      ) {
        redirect(
          `/api/auth/login?returnTo=${encodeURIComponent(safeDestination)}`,
        );
      }
      if (error instanceof AuthError && error.status === 403) {
        redirect("/auth/forbidden");
      }
      throw error;
    }
  }

  try {
    await requireWorkspacePermission(permission);
    return children;
  } catch (error) {
    if (
      error instanceof AuthError &&
      error.code === "authentication_required"
    ) {
      redirect(
        `/api/auth/login?returnTo=${encodeURIComponent(safeDestination)}`,
      );
    }
    if (error instanceof AuthError && error.status === 403) {
      redirect("/auth/forbidden");
    }
    throw error;
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
