import type { AppDatabase } from "../../db";
import {
  findWorkspaceByOrganizationId,
  getActiveMembership,
  getActiveMembershipsForUser,
  createWorkspaceWithOwner,
  type WorkspaceRole,
} from "./workspaces";
import { resolveOrCreateUserIdentity } from "./users";

export type ResolveIdentityInput = {
  issuer: string;
  subject: string;
  email: string | null;
  organizationId: string | null;
  assertedRoles: string[];
};

export type ResolvedIdentity = {
  userId: string;
  workspaceId: string;
  roles: WorkspaceRole[];
};

export class MembershipRequiredError extends Error {
  constructor() {
    super("The authenticated user does not have an active local membership");
    this.name = "MembershipRequiredError";
  }
}

function safeSlugPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return normalized || "workspace";
}

export function createDataAuthStore(db: AppDatabase) {
  return {
    async resolveIdentity(
      input: ResolveIdentityInput,
    ): Promise<ResolvedIdentity> {
      const identity = await resolveOrCreateUserIdentity(db, {
        issuer: input.issuer,
        subject: input.subject,
        email: input.email,
      });

      if (input.organizationId) {
        const existingWorkspace = await findWorkspaceByOrganizationId(
          db,
          input.organizationId,
        );
        if (existingWorkspace) {
          const membership = await getActiveMembership(
            db,
            identity.userId,
            existingWorkspace.id,
          );
          if (!membership) throw new MembershipRequiredError();
          return {
            userId: identity.userId,
            workspaceId: existingWorkspace.id,
            roles: [membership.role],
          };
        }

        const created = await createWorkspaceWithOwner(db, {
          ownerUserId: identity.userId,
          name: "New workspace",
          slug: `${safeSlugPart(input.organizationId)}-${crypto.randomUUID().slice(0, 8)}`,
          auth0OrganizationId: input.organizationId,
        });
        return {
          userId: identity.userId,
          workspaceId: created.workspaceId,
          roles: [created.role],
        };
      }

      const [membership] = await getActiveMembershipsForUser(
        db,
        identity.userId,
      );
      if (membership) {
        return {
          userId: identity.userId,
          workspaceId: membership.workspaceId,
          roles: [membership.role],
        };
      }

      const created = await createWorkspaceWithOwner(db, {
        ownerUserId: identity.userId,
        name: input.email ? `${input.email.split("@")[0]}'s workspace` : "My workspace",
        slug: `personal-${crypto.randomUUID().slice(0, 12)}`,
      });
      return {
        userId: identity.userId,
        workspaceId: created.workspaceId,
        roles: [created.role],
      };
    },
  };
}

