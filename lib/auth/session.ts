import { getAuthConfig } from "./config";
import { openJson, sealJson } from "./crypto";
import type { AuthSession, AuthTransaction } from "./types";

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
      (value.mode === "auth0" || value.mode === "demo") &&
      typeof value.userId === "string" &&
      typeof value.workspaceId === "string" &&
      typeof value.subject === "string" &&
      typeof value.issuer === "string" &&
      (typeof value.email === "string" || value.email === null) &&
      (typeof value.organizationId === "string" ||
        value.organizationId === null) &&
      Array.isArray(value.roles) &&
      Array.isArray(value.permissions) &&
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
      typeof value.createdAt === "number" &&
      typeof value.expiresAt === "number",
  );
}
