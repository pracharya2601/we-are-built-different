export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "billing_admin",
  "member",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type AuthContext = {
  userId: string;
  workspaceId: string;
  subject: string;
  email: string | null;
  roles: WorkspaceRole[];
};

export type AuthMode = "auth0" | "demo";

export type WorkspacePermission =
  | "billing:manage"
  | "members:manage"
  | "product:use"
  | (string & {});

export type AuthSession = AuthContext & {
  version: 1;
  mode: AuthMode;
  issuer: string;
  organizationId: string | null;
  permissions: string[];
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
