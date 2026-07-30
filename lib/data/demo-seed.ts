import type { AppDatabase } from "../../db";
import {
  entitlements,
  identities,
  memberships,
  users,
  workspaces,
} from "../../db/schema";

export const DEMO_SEED_IDS = {
  userId: "usr_demo_local_only",
  identityId: "idn_demo_local_only",
  workspaceId: "wsp_demo_local_only",
} as const;

/**
 * Creates an explicitly non-production identity and inactive workspace.
 * This never creates billing records or fabricates paid access.
 */
export async function seedDemoData(
  db: AppDatabase,
  environment: string | undefined,
) {
  if (environment !== "demo" && environment !== "development") {
    throw new Error(
      "Demo seed refused: APP_ENV must be `demo` or `development`",
    );
  }

  const now = new Date();
  await db.batch([
    db
      .insert(users)
      .values({
        id: DEMO_SEED_IDS.userId,
        displayName: "Demo User",
        primaryEmail: "demo@example.invalid",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: users.id }),
    db
      .insert(identities)
      .values({
        id: DEMO_SEED_IDS.identityId,
        userId: DEMO_SEED_IDS.userId,
        issuer: "urn:built-different:demo",
        subject: "demo-user",
        email: "demo@example.invalid",
        emailVerified: true,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [identities.issuer, identities.subject],
      }),
    db
      .insert(workspaces)
      .values({
        id: DEMO_SEED_IDS.workspaceId,
        name: "Demo workspace",
        slug: "demo-local-only",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: workspaces.id }),
    db
      .insert(memberships)
      .values({
        workspaceId: DEMO_SEED_IDS.workspaceId,
        userId: DEMO_SEED_IDS.userId,
        role: "owner",
        status: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [memberships.workspaceId, memberships.userId],
      }),
    db
      .insert(entitlements)
      .values({
        workspaceId: DEMO_SEED_IDS.workspaceId,
        key: "platform_access",
        accessState: "inactive",
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [entitlements.workspaceId, entitlements.key],
      }),
  ]);

  return DEMO_SEED_IDS;
}

