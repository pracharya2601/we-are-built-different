import type { AuthMode } from "./types";

const DEMO_SECRET =
  "built-different-demo-session-secret-not-for-live-authentication";

export type AuthConfig = {
  mode: AuthMode;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  audience: string | null;
  appBaseUrl: string;
  sessionSecret: string;
  rolesClaim: string;
  permissionsClaim: string;
};

export function getAuthConfig(requestUrl?: string): AuthConfig {
  const domain = env("AUTH0_DOMAIN");
  const clientId = env("AUTH0_CLIENT_ID");
  const configuredValues = [domain, clientId].filter(Boolean).length;

  if (configuredValues === 1) {
    throw new Error(
      "Auth0 is partially configured; set both AUTH0_DOMAIN and AUTH0_CLIENT_ID.",
    );
  }

  if (!domain || !clientId) {
    return {
      mode: "demo",
      issuer: "https://demo.invalid/",
      clientId: "demo",
      clientSecret: null,
      audience: null,
      appBaseUrl: resolveBaseUrl(requestUrl),
      sessionSecret: env("AUTH0_SESSION_SECRET") ?? DEMO_SECRET,
      rolesClaim: defaultRolesClaim(),
      permissionsClaim: env("AUTH0_PERMISSIONS_CLAIM") ?? "permissions",
    };
  }

  const sessionSecret = env("AUTH0_SESSION_SECRET");
  const appBaseUrl = env("AUTH0_APP_BASE_URL");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error(
      "AUTH0_SESSION_SECRET must contain at least 32 characters in Auth0 mode.",
    );
  }
  if (!appBaseUrl) {
    throw new Error("AUTH0_APP_BASE_URL is required in Auth0 mode.");
  }

  return {
    mode: "auth0",
    issuer: normalizeIssuer(domain),
    clientId,
    clientSecret: env("AUTH0_CLIENT_SECRET"),
    audience: env("AUTH0_AUDIENCE"),
    appBaseUrl: normalizeBaseUrl(appBaseUrl),
    sessionSecret,
    rolesClaim: defaultRolesClaim(),
    permissionsClaim: env("AUTH0_PERMISSIONS_CLAIM") ?? "permissions",
  };
}

export function isAuth0Configured(): boolean {
  return Boolean(env("AUTH0_DOMAIN") && env("AUTH0_CLIENT_ID"));
}

function defaultRolesClaim(): string {
  return (
    env("AUTH0_ROLES_CLAIM") ?? "https://built-different.app/roles"
  );
}

function resolveBaseUrl(requestUrl?: string): string {
  const configured = env("AUTH0_APP_BASE_URL");
  if (configured) return normalizeBaseUrl(configured);
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
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
