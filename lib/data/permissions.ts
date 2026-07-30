import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { membershipPermissionOverrides } from "../../db/schema";
import type {
  PermissionOverride,
  WorkspacePermission,
} from "../auth";

export async function listMembershipPermissionOverrides(
  db: AppDatabase,
  workspaceId: string,
  userId: string,
): Promise<PermissionOverride[]> {
  return db
    .select({
      permission: membershipPermissionOverrides.permission,
      effect: membershipPermissionOverrides.effect,
    })
    .from(membershipPermissionOverrides)
    .where(
      and(
        eq(membershipPermissionOverrides.workspaceId, workspaceId),
        eq(membershipPermissionOverrides.userId, userId),
      ),
    ) as Promise<PermissionOverride[]>;
}

export async function replaceMembershipPermissionOverrides(
  db: AppDatabase,
  input: {
    workspaceId: string;
    userId: string;
    overrides: readonly PermissionOverride[];
  },
): Promise<void> {
  const deleteQuery = db
    .delete(membershipPermissionOverrides)
    .where(
      and(
        eq(membershipPermissionOverrides.workspaceId, input.workspaceId),
        eq(membershipPermissionOverrides.userId, input.userId),
      ),
    );
  if (input.overrides.length === 0) {
    await deleteQuery;
    return;
  }

  const now = new Date();
  await db.batch([
    deleteQuery,
    db.insert(membershipPermissionOverrides).values(
      input.overrides.map((override) => ({
        workspaceId: input.workspaceId,
        userId: input.userId,
        permission: override.permission as WorkspacePermission,
        effect: override.effect,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);
}
