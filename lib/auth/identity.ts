import { stableInternalId } from "./crypto";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "./types";

export type ExternalIdentity = {
  issuer: string;
  subject: string;
  email: string | null;
  organizationId: string | null;
  assertedRoles: WorkspaceRole[];
};

export type ResolvedIdentity = {
  userId: string;
  workspaceId: string;
  roles: WorkspaceRole[];
};

export interface AuthIdentityAdapter {
  resolveIdentity(identity: ExternalIdentity): Promise<ResolvedIdentity>;
}

/**
 * Scaffold fallback used until the D1 identity adapter is composed at the app
 * boundary. It never joins on email; IDs are stable hashes of provider keys.
 */
export const deterministicIdentityAdapter: AuthIdentityAdapter = {
  async resolveIdentity(identity) {
    const userId = await stableInternalId(
      "usr",
      `${identity.issuer}\0${identity.subject}`,
    );
    const workspaceKey = identity.organizationId
      ? `${identity.issuer}\0organization\0${identity.organizationId}`
      : `${identity.issuer}\0personal\0${identity.subject}`;
    return {
      userId,
      workspaceId: await stableInternalId("wsp", workspaceKey),
      roles:
        identity.assertedRoles.length > 0
          ? identity.assertedRoles
          : ["member"],
    };
  },
};

export function parseWorkspaceRoles(value: unknown): WorkspaceRole[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(WORKSPACE_ROLES);
  return [
    ...new Set(
      value.filter(
        (role): role is WorkspaceRole =>
          typeof role === "string" && allowed.has(role),
      ),
    ),
  ];
}

export function parsePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (permission): permission is string =>
          typeof permission === "string" &&
          permission.length > 0 &&
          permission.length <= 128,
      ),
    ),
  ];
}
