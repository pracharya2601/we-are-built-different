// Value imports carry the .ts extension so tests can import this module
// directly under Node type stripping, matching lib/auth/authorization.ts.
import { getAuthConfig } from "./config.ts";
import { openJson, sealJson } from "./crypto.ts";
import { normalizeSignInIntent } from "./sign-in-intent.ts";
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  type AuthSession,
  type AuthTransaction,
} from "./types.ts";
import { isAccountType } from "../accounts/index.ts";

const SESSION_PURPOSE = "built-different/auth-session/v1";
const TRANSACTION_PURPOSE = "built-different/auth-transaction/v1";

export async function encodeSession(
  session: AuthSession,
  requestUrl?: string,
): Promise<string> {
  return sealJson(
    session,
    getAuthConfig(requestUrl).sessionSecret,
    SESSION_PURPOSE,
  );
}

export async function decodeSession(
  cookie: string,
  requestUrl?: string,
): Promise<AuthSession | null> {
  const session = await openJson<AuthSession>(
    cookie,
    getAuthConfig(requestUrl).sessionSecret,
    SESSION_PURPOSE,
  );
  if (!isSession(session)) return null;
  if (session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return session;
}

export async function encodeTransaction(
  transaction: AuthTransaction,
  requestUrl?: string,
): Promise<string> {
  return sealJson(
    transaction,
    getAuthConfig(requestUrl).sessionSecret,
    TRANSACTION_PURPOSE,
  );
}

export async function decodeTransaction(
  cookie: string,
  requestUrl?: string,
): Promise<AuthTransaction | null> {
  const transaction = await openJson<AuthTransaction>(
    cookie,
    getAuthConfig(requestUrl).sessionSecret,
    TRANSACTION_PURPOSE,
  );
  if (!isTransaction(transaction)) return null;
  if (transaction.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return transaction;
}

function isSession(value: AuthSession | null): value is AuthSession {
  return Boolean(
    value &&
      value.version === 1 &&
      value.mode === "auth0" &&
      typeof value.userId === "string" &&
      typeof value.workspaceId === "string" &&
      isAccountType(value.accountType) &&
      typeof value.subject === "string" &&
      typeof value.issuer === "string" &&
      (typeof value.email === "string" || value.email === null) &&
      (typeof value.organizationId === "string" ||
        value.organizationId === null) &&
      (value.signInIntent === undefined ||
        value.signInIntent === null ||
        normalizeSignInIntent(value.signInIntent) !== null) &&
      Array.isArray(value.roles) &&
      value.roles.every((role) => WORKSPACE_ROLES.includes(role)) &&
      Array.isArray(value.permissions) &&
      value.permissions.every((permission) =>
        WORKSPACE_PERMISSIONS.includes(permission),
      ) &&
      Array.isArray(value.tokenRoles) &&
      value.tokenRoles.every((role) => WORKSPACE_ROLES.includes(role)) &&
      Array.isArray(value.tokenPermissions) &&
      value.tokenPermissions.every(
        (permission) => typeof permission === "string",
      ) &&
      typeof value.issuedAt === "number" &&
      typeof value.expiresAt === "number",
  );
}

function isTransaction(
  value: AuthTransaction | null,
): value is AuthTransaction {
  return Boolean(
    value &&
      value.version === 1 &&
      typeof value.state === "string" &&
      typeof value.nonce === "string" &&
      typeof value.codeVerifier === "string" &&
      typeof value.returnTo === "string" &&
      (typeof value.organizationId === "string" ||
        value.organizationId === null) &&
      (value.signInIntent === undefined ||
        value.signInIntent === null ||
        normalizeSignInIntent(value.signInIntent) !== null) &&
      typeof value.createdAt === "number" &&
      typeof value.expiresAt === "number",
  );
}
