import type { AppDatabase } from "../../db";
import { ACCOUNT_POLICIES } from "../accounts";
import type { AuthContext } from "../auth";
import { getWorkspaceAccess } from "../data";

export async function hasImageUploadAccess(
  db: AppDatabase,
  auth: AuthContext,
): Promise<boolean> {
  const policy = ACCOUNT_POLICIES[auth.accountType];
  if (!policy.dashboardRequiresSubscription) return true;
  const access = await getWorkspaceAccess(db, auth.workspaceId);
  return ["active", "trialing", "grace"].includes(access);
}
