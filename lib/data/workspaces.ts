import { and, asc, count, eq, or } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  entitlements,
  memberships,
  users,
  workspaces,
} from "../../db/schema";
import type { AccountType } from "../accounts";
import { createId } from "./ids";

export type WorkspaceRole = "owner" | "admin" | "billing_admin" | "member";
export type WorkspaceType = "personal" | "team";

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

export async function findWorkspaceBySlug(db: AppDatabase, slug: string) {
  return (
    (await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
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
      workspaceType: workspaces.workspaceType,
      accountType: workspaces.accountType,
      auth0OrganizationId: workspaces.auth0OrganizationId,
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

export async function getActiveWorkspaceMembership(
  db: AppDatabase,
  userId: string,
  workspaceId: string,
) {
  return (
    (await db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceSlug: workspaces.slug,
        workspaceType: workspaces.workspaceType,
        accountType: workspaces.accountType,
        auth0OrganizationId: workspaces.auth0OrganizationId,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.status, "active"),
          eq(workspaces.status, "active"),
          eq(users.status, "active"),
        ),
      )
      .limit(1))[0] ?? null
  );
}

export async function getWorkspaceMembership(
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
        ),
      )
      .limit(1))[0] ?? null
  );
}

export async function listWorkspaceMembers(
  db: AppDatabase,
  workspaceId: string,
) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.primaryEmail,
      role: memberships.role,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(users.primaryEmail), asc(users.id));
}

export async function countActiveWorkspaceOwners(
  db: AppDatabase,
  workspaceId: string,
): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
        eq(memberships.status, "active"),
      ),
    );
  return result?.value ?? 0;
}

export async function countActiveWorkspaceManagers(
  db: AppDatabase,
  workspaceId: string,
): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.status, "active"),
        or(
          eq(memberships.role, "owner"),
          eq(memberships.role, "admin"),
        ),
      ),
    );
  return result?.value ?? 0;
}

export async function updateWorkspaceMembership(
  db: AppDatabase,
  input: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    status: "active" | "suspended";
  },
) {
  const now = new Date();
  return (
    (await db
      .update(memberships)
      .set({
        role: input.role,
        status: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(memberships.workspaceId, input.workspaceId),
          eq(memberships.userId, input.userId),
        ),
      )
      .returning())[0] ?? null
  );
}

export async function createWorkspaceMembership(
  db: AppDatabase,
  input: {
    workspaceId: string;
    userId: string;
    role?: WorkspaceRole;
    invitedByUserId?: string | null;
  },
) {
  const now = new Date();
  await db
    .insert(memberships)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role ?? "member",
      status: "active",
      invitedByUserId: input.invitedByUserId ?? null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [memberships.workspaceId, memberships.userId],
    });
  return getActiveMembership(db, input.userId, input.workspaceId);
}

export async function createWorkspaceWithOwner(
  db: AppDatabase,
  input: {
    ownerUserId: string;
    name: string;
    slug: string;
    workspaceType?: WorkspaceType;
    accountType?: AccountType;
    initialRole?: WorkspaceRole;
    auth0OrganizationId?: string | null;
    entitlementKey?: string;
  },
) {
  const now = new Date();
  const workspaceId = createId("wsp");

  await db.batch([
    db.insert(workspaces).values({
      id: workspaceId,
      name: input.name,
      slug: input.slug,
      workspaceType: input.workspaceType ?? "team",
      accountType: input.accountType ?? "beneficiary",
      auth0OrganizationId: input.auth0OrganizationId ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(memberships).values({
      workspaceId,
      userId: input.ownerUserId,
      role: input.initialRole ?? "owner",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(entitlements).values({
      workspaceId,
      key: input.entitlementKey ?? "platform_access",
      accessState: "inactive",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return { workspaceId, role: input.initialRole ?? ("owner" as const) };
}
