import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { entitlements, memberships, workspaces } from "../../db/schema";
import { createId } from "./ids";

export type WorkspaceRole = "owner" | "admin" | "billing_admin" | "member";

export async function findWorkspaceByOrganizationId(
  db: AppDatabase,
  organizationId: string,
) {
  return (
    (await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.auth0OrganizationId, organizationId))
      .limit(1))[0] ?? null
  );
}

export async function getActiveMembershipsForUser(
  db: AppDatabase,
  userId: string,
) {
  return db
    .select({
      workspaceId: memberships.workspaceId,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        eq(workspaces.status, "active"),
      ),
    );
}

export async function getActiveMembership(
  db: AppDatabase,
  userId: string,
  workspaceId: string,
) {
  return (
    (await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1))[0] ?? null
  );
}

export async function createWorkspaceWithOwner(
  db: AppDatabase,
  input: {
    ownerUserId: string;
    name: string;
    slug: string;
    auth0OrganizationId?: string | null;
  },
) {
  const now = new Date();
  const workspaceId = createId("wsp");

  await db.batch([
    db.insert(workspaces).values({
      id: workspaceId,
      name: input.name,
      slug: input.slug,
      auth0OrganizationId: input.auth0OrganizationId ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(memberships).values({
      workspaceId,
      userId: input.ownerUserId,
      role: "owner",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(entitlements).values({
      workspaceId,
      key: "platform_access",
      accessState: "inactive",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return { workspaceId, role: "owner" as const };
}

