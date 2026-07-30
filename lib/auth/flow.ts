import type { AuthConfig } from "./config";
import { randomBase64Url, pkceChallenge } from "./crypto";
import {
  deterministicIdentityAdapter,
  parsePermissions,
  parseWorkspaceRoles,
  type AuthIdentityAdapter,
} from "./identity";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  validateAccessToken,
  validateIdToken,
} from "./oidc";
import type { AuthSession, AuthTransaction } from "./types";
import { AuthError } from "./types";

const TRANSACTION_LIFETIME_SECONDS = 10 * 60;
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

export async function beginAuth0Login(
  config: AuthConfig,
  input: {
    returnTo: string;
    organizationId?: string | null;
    invitation?: string | null;
  },
): Promise<{ transaction: AuthTransaction; authorizationUrl: string }> {
  const now = Math.floor(Date.now() / 1000);
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const codeVerifier = randomBase64Url(48);
  const organizationId = normalizeOrganizationId(input.organizationId);
  const invitation = normalizeInvitation(input.invitation);
  if (invitation && !organizationId) {
    throw new AuthError(
      "missing_invitation_organization",
      "An Auth0 invitation must include its organization ID.",
    );
  }
  const transaction: AuthTransaction = {
    version: 1,
    state,
    nonce,
    codeVerifier,
    returnTo: safeReturnTo(input.returnTo),
    organizationId,
    createdAt: now,
    expiresAt: now + TRANSACTION_LIFETIME_SECONDS,
  };
  const redirectUri = authCallbackUrl(config);
  return {
    transaction,
    authorizationUrl: buildAuthorizationUrl(config, {
      redirectUri,
      state,
      nonce,
      codeChallenge: await pkceChallenge(codeVerifier),
      organizationId,
      invitation,
    }),
  };
}

export async function completeAuth0Login(
  config: AuthConfig,
  input: {
    code: string;
    transaction: AuthTransaction;
    identityAdapter?: AuthIdentityAdapter;
  },
): Promise<AuthSession> {
  const tokenSet = await exchangeAuthorizationCode(config, {
    code: input.code,
    codeVerifier: input.transaction.codeVerifier,
    redirectUri: authCallbackUrl(config),
  });
  const claims = await validateIdToken(tokenSet.idToken, config, {
    nonce: input.transaction.nonce,
    accessToken: tokenSet.accessToken,
  });

  const organizationId =
    typeof claims.org_id === "string" ? claims.org_id : null;
  if (
    organizationId !== null &&
    !/^org_[A-Za-z0-9]+$/u.test(organizationId)
  ) {
    throw new AuthError(
      "invalid_token_organization",
      "The token organization ID is invalid.",
    );
  }
  if (input.transaction.organizationId !== organizationId) {
    // An organization is a tenant boundary, so the callback must match the
    // organization selected before redirecting to Auth0.
    throw new AuthError(
      "organization_mismatch",
      "The authenticated organization does not match the login request.",
    );
  }

  let permissions: string[] = [];
  if (config.audience && !tokenSet.accessToken) {
    throw new AuthError(
      "missing_access_token",
      "Auth0 did not return the requested API access token.",
    );
  }
  if (config.audience && tokenSet.accessToken) {
    const accessClaims = await validateAccessToken(
      tokenSet.accessToken,
      config,
    );
    if (
      accessClaims.sub !== claims.sub ||
      (accessClaims.org_id ?? null) !== organizationId
    ) {
      throw new AuthError(
        "access_token_identity_mismatch",
        "The access and ID token identities do not match.",
      );
    }
    permissions = parsePermissions(
      accessClaims[config.permissionsClaim] ?? accessClaims.permissions,
    );
  }

  const assertedRoles = parseWorkspaceRoles(claims[config.rolesClaim]);
  const resolved = await (
    input.identityAdapter ?? deterministicIdentityAdapter
  ).resolveIdentity({
    issuer: claims.iss,
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    organizationId,
    assertedRoles,
  });
  const now = Math.floor(Date.now() / 1000);

  return {
    version: 1,
    mode: "auth0",
    issuer: claims.iss,
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    organizationId,
    userId: resolved.userId,
    workspaceId: resolved.workspaceId,
    roles: resolved.roles,
    permissions,
    issuedAt: now,
    expiresAt: Math.min(claims.exp, now + SESSION_LIFETIME_SECONDS),
  };
}

export function createDemoSession(): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    version: 1,
    mode: "demo",
    issuer: "https://demo.invalid/",
    subject: "demo-user",
    email: "demo@example.com",
    organizationId: null,
    userId: "usr_demo",
    workspaceId: "wsp_demo",
    roles: ["owner"],
    permissions: ["billing:manage", "members:manage", "product:use"],
    issuedAt: now,
    expiresAt: now + SESSION_LIFETIME_SECONDS,
  };
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.invalid");
    if (url.origin !== "https://app.invalid") return "/";
    if (url.pathname.startsWith("/api/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function authCallbackUrl(config: AuthConfig): string {
  return new URL("/api/auth/callback", config.appBaseUrl).toString();
}

function normalizeOrganizationId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (!/^org_[A-Za-z0-9]+$/u.test(value)) {
    throw new AuthError(
      "invalid_organization",
      "The Auth0 organization ID is invalid.",
    );
  }
  return value;
}

function normalizeInvitation(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9._~-]+$/u.test(value)) {
    throw new AuthError(
      "invalid_invitation",
      "The Auth0 invitation ticket is invalid.",
    );
  }
  return value;
}
