export type AuthConfig = {
  mode: "auth0";
  issuer: string;
  clientId: string;
  clientSecret: string;
  /**
   * Optional. When set, login additionally requests an API access token and
   * records its verified roles/permissions as token assertions. The identifier
   * must name an API that exists in the tenant, or Auth0 rejects every
   * authorization request with "Service not found".
   *
   * When absent, sign-in uses the ID token alone and token assertions stay
   * empty. This does not widen access: authorization is decided by D1
   * membership roles in every case (see completeAuth0Login).
   */
  audience: string | null;
  appBaseUrl: string;
  sessionSecret: string;
  rolesClaim: string;
  permissionsClaim: string;
};

const REQUIRED_AUTH0_ENV = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_APP_BASE_URL",
  "AUTH0_SESSION_SECRET",
] as const;

export class AuthConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`Auth0 configuration is required. Missing: ${missing.join(", ")}.`);
    this.name = "AuthConfigurationError";
    this.missing = missing;
  }
}

export function getAuthConfigurationStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing = REQUIRED_AUTH0_ENV.filter((name) => !env(name));
  const sessionSecret = env("AUTH0_SESSION_SECRET");
  if (
    sessionSecret &&
    sessionSecret.length < 32 &&
    !missing.includes("AUTH0_SESSION_SECRET")
  ) {
    missing.push("AUTH0_SESSION_SECRET");
  }
  return { configured: missing.length === 0, missing };
}

export function authSetupPath(
  returnTo = "/dashboard",
  signInIntent?: string | null,
): string {
  const params = new URLSearchParams({ returnTo });
  if (signInIntent) params.set("intent", signInIntent);
  return `/auth/setup?${params.toString()}`;
}

export function getAuthConfig(_requestUrl?: string): AuthConfig {
  void _requestUrl;
  const domain = env("AUTH0_DOMAIN");
  const clientId = env("AUTH0_CLIENT_ID");
  const clientSecret = env("AUTH0_CLIENT_SECRET");
  const sessionSecret = env("AUTH0_SESSION_SECRET");
  const appBaseUrl = env("AUTH0_APP_BASE_URL");
  const audience = env("AUTH0_AUDIENCE");
  const missing = getAuthConfigurationStatus().missing;
  if (
    !domain ||
    !clientId ||
    !clientSecret ||
    !appBaseUrl ||
    !sessionSecret
  ) {
    throw new AuthConfigurationError(missing);
  }
  if (sessionSecret.length < 32) {
    throw new AuthConfigurationError(["AUTH0_SESSION_SECRET"]);
  }

  return {
    mode: "auth0",
    issuer: normalizeIssuer(domain),
    clientId,
    clientSecret,
    audience,
    appBaseUrl: normalizeBaseUrl(appBaseUrl),
    sessionSecret,
    rolesClaim: defaultRolesClaim(),
    permissionsClaim: env("AUTH0_PERMISSIONS_CLAIM") ?? "permissions",
  };
}

export function isAuth0Configured(): boolean {
  return Boolean(
    env("AUTH0_DOMAIN") &&
      env("AUTH0_CLIENT_ID") &&
      env("AUTH0_CLIENT_SECRET") &&
      env("AUTH0_APP_BASE_URL") &&
      (env("AUTH0_SESSION_SECRET")?.length ?? 0) >= 32,
  );
}

function defaultRolesClaim(): string {
  return (
    env("AUTH0_ROLES_CLAIM") ?? "https://built-different.app/roles"
  );
}

function normalizeIssuer(value: string): string {
  const withScheme = value.includes("://") ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol !== "https:") {
    throw new Error("AUTH0_DOMAIN must use HTTPS.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("AUTH0_DOMAIN must not include a path, query, or fragment.");
  }
  return `${url.origin}/`;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "AUTH0_APP_BASE_URL must be an origin without a path, query, or fragment.",
    );
  }
  return url.origin;
}

function env(name: string): string | null {
  const value =
    typeof process !== "undefined" ? process.env?.[name]?.trim() : undefined;
  return value || null;
}
