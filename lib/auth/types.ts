import type { SignInIntent } from "./sign-in-intent";
import type { AccountType } from "../accounts";

export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "billing_admin",
  "member",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_PERMISSIONS = [
  "workspace:view",
  "workspace:manage",
  "billing:manage",
  "funds:view",
  "funds:manage",
  "members:manage",
  "product:use",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export type AuthContext = {
  userId: string;
  workspaceId: string;
  accountType: AccountType;
  subject: string;
  email: string | null;
  roles: WorkspaceRole[];
  permissions: WorkspacePermission[];
  tokenRoles: WorkspaceRole[];
  tokenPermissions: string[];
  signInIntent: SignInIntent | null;
};

export type AuthMode = "auth0" | "local";

export type AuthSession = AuthContext & {
  version: 1;
  mode: AuthMode;
  issuer: string;
  organizationId: string | null;
  issuedAt: number;
  expiresAt: number;
};

export type AuthTransaction = {
  version: 1;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  organizationId: string | null;
  signInIntent: SignInIntent | null;
  createdAt: number;
  expiresAt: number;
};

export class AuthError extends Error {
  readonly status: 401 | 403 | 500;
  readonly code: string;

  constructor(
    code: string,
    message: string,
    status: 401 | 403 | 500 = 401,
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}
