import type { AppDatabase } from "../../db";
import {
  findWorkspaceBySlug,
  findWorkspaceByOrganizationId,
  getActiveMembership,
  getActiveMembershipsForUser,
  createWorkspaceMembership,
  createWorkspaceWithOwner,
  type WorkspaceRole,
} from "./workspaces";
import { resolveOrCreateUserIdentity } from "./users";
import { bootstrapPlatformOwner } from "./platform-operators";
import { canBootstrapCompany, companyConfig } from "../config";
import {
  ACCOUNT_POLICIES,
  accountTypeFromSignInIntent,
  type AccountType,
} from "../accounts";
import type { SignInIntent } from "../auth/sign-in-intent";

export type ResolveIdentityInput = {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  organizationId: string | null;
  assertedRoles: string[];
  signInIntent: SignInIntent | null;
};

export type ResolvedIdentity = {
  userId: string;
  workspaceId: string;
  accountType: AccountType;
  roles: WorkspaceRole[];
};

export class MembershipRequiredError extends Error {
  constructor() {
    super("The authenticated user does not have an active local membership");
    this.name = "MembershipRequiredError";
  }
}

async function resolveSingleCompanyIdentity(
  db: AppDatabase,
  input: ResolveIdentityInput,
  userId: string,
): Promise<ResolvedIdentity> {
  const expectedOrganizationId =
    companyConfig.access.auth0OrganizationId;
  if (
    expectedOrganizationId &&
    input.organizationId !== expectedOrganizationId
  ) {
    throw new MembershipRequiredError();
  }

  const workspace = await findWorkspaceBySlug(
    db,
    companyConfig.application.defaultWorkspaceSlug,
  );
  if (workspace) {
    const membership = await getActiveMembership(db, userId, workspace.id);
    if (!membership) throw new MembershipRequiredError();
    return {
      userId,
      workspaceId: workspace.id,
      accountType: workspace.accountType,
      roles: [membership.role],
    };
  }

  if (!canBootstrapCompany(input.email)) {
    throw new MembershipRequiredError();
  }
  const created = await createWorkspaceWithOwner(db, {
    ownerUserId: userId,
    name: companyConfig.application.defaultWorkspaceName,
    slug: companyConfig.application.defaultWorkspaceSlug,
    workspaceType: "team",
    auth0OrganizationId: expectedOrganizationId ?? input.organizationId,
    entitlementKey: companyConfig.entitlements.productAccessKey,
    accountType: "nonprofit",
  });
  return {
    userId,
    workspaceId: created.workspaceId,
    accountType: "nonprofit",
    roles: [created.role],
  };
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
        emailVerified: input.emailVerified,
      });
      await bootstrapPlatformOwner(db, {
        userId: identity.userId,
        email: input.email,
        emailVerified: input.emailVerified,
      });

      if (!companyConfig.features.multiTenant) {
        return resolveSingleCompanyIdentity(
          db,
          input,
          identity.userId,
        );
      }

      if (input.organizationId) {
        const existingWorkspace = await findWorkspaceByOrganizationId(
          db,
          input.organizationId,
        );
        if (existingWorkspace) {
          let membership = await getActiveMembership(
            db,
            identity.userId,
            existingWorkspace.id,
          );
          if (!membership) {
            membership = await createWorkspaceMembership(db, {
              workspaceId: existingWorkspace.id,
              userId: identity.userId,
              role: preferredAssertedRole(input.assertedRoles) ?? "member",
            });
          }
          if (!membership) throw new MembershipRequiredError();
          return {
            userId: identity.userId,
            workspaceId: existingWorkspace.id,
            accountType: existingWorkspace.accountType,
            roles: [membership.role],
          };
        }

        const accountType = accountTypeFromSignInIntent(input.signInIntent);
        const created = await createWorkspaceWithOwner(db, {
          ownerUserId: identity.userId,
          name: "New workspace",
          slug: `${safeSlugPart(input.organizationId)}-${crypto.randomUUID().slice(0, 8)}`,
          workspaceType: "team",
          auth0OrganizationId: input.organizationId,
          accountType,
          initialRole:
            preferredAssertedRole(input.assertedRoles) ??
            ACCOUNT_POLICIES[accountType].defaultRole,
        });
        return {
          userId: identity.userId,
          workspaceId: created.workspaceId,
          accountType,
          roles: [created.role],
        };
      }

      const memberships = await getActiveMembershipsForUser(
        db,
        identity.userId,
      );
      const requestedAccountType = accountTypeFromSignInIntent(
        input.signInIntent,
      );
      const membership = input.signInIntent
        ? memberships.find(
            (item) => item.accountType === requestedAccountType,
          )
        : memberships[0];
      if (membership) {
        return {
          userId: identity.userId,
          workspaceId: membership.workspaceId,
          accountType: membership.accountType,
          roles: [membership.role],
        };
      }

      const accountType = requestedAccountType;
      const policy = ACCOUNT_POLICIES[accountType];
      const created = await createWorkspaceWithOwner(db, {
        ownerUserId: identity.userId,
        name: input.email
          ? `${input.email.split("@")[0]}'s workspace`
          : accountType === "service_provider"
            ? "My practice"
            : "My workspace",
        slug: `${accountType}-${crypto.randomUUID().slice(0, 12)}`,
        workspaceType: policy.collaborative ? "team" : "personal",
        accountType,
        initialRole: policy.defaultRole,
      });
      return {
        userId: identity.userId,
        workspaceId: created.workspaceId,
        accountType,
        roles: [created.role],
      };
    },
  };
}

function preferredAssertedRole(roles: readonly string[]): WorkspaceRole | null {
  for (const role of ["owner", "admin", "billing_admin", "member"] as const) {
    if (roles.includes(role)) return role;
  }
  return null;
}
