import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { entitlements } from "../../db/schema";

export type AccessState = "active" | "trialing" | "grace" | "inactive";

export async function getWorkspaceAccess(
  db: AppDatabase,
  workspaceId: string,
  key = "platform_access",
): Promise<AccessState> {
  const result = (
    await db
      .select({
        accessState: entitlements.accessState,
        validUntil: entitlements.validUntil,
      })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.workspaceId, workspaceId),
          eq(entitlements.key, key),
        ),
      )
      .limit(1)
  )[0];

  if (!result) return "inactive";
  if (result.validUntil && result.validUntil.getTime() <= Date.now()) {
    return "inactive";
  }
  return result.accessState;
}

