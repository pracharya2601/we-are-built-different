import type {
  BillingAuthAdapter,
  BillingAuthContext,
} from "./types";

type WorkspacePermissionGuard = (
  permission: "billing:manage",
  request?: Request,
) => Promise<BillingAuthContext>;

/**
 * Adapts the auth workstream's permission guard without coupling billing to
 * Auth0 SDK types.
 */
export function createBillingAuthAdapter(
  requireWorkspacePermission: WorkspacePermissionGuard,
): BillingAuthAdapter {
  return {
    requireBillingManager(request) {
      return requireWorkspacePermission("billing:manage", request);
    },
  };
}
