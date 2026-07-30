import type { AuthConfig } from "./config";
import {
  constantTimeEqual,
  decodeBase64Url,
  decodeBase64UrlJson,
  encodeBase64Url,
  sha256,
  toArrayBuffer,
} from "./crypto";
import { AuthError } from "./types";

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

export type IdTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce: string;
  azp?: string;
  nbf?: number;
  email?: string;
  org_id?: string;
  at_hash?: string;
  [claim: string]: unknown;
};

type AccessTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  azp?: string;
  nbf?: number;
  org_id?: string;
  permissions?: string[];
  [claim: string]: unknown;
};

type AuthJsonWebKey = JsonWebKey & {
  kid?: string;
  use?: string;
  alg?: string;
};

type JsonWebKeySet = { keys: AuthJsonWebKey[] };

export type TokenSet = {
  accessToken: string | null;
  idToken: string;
  expiresIn: number | null;
};

const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_SECONDS = 60 * 60;
const jwksCache = new Map<
  string,
  { keys: AuthJsonWebKey[]; expiresAt: number }
>();

export function buildAuthorizationUrl(
  config: AuthConfig,
  input: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
    organizationId?: string | null;
    invitation?: string | null;
  },
): string {
  const url = new URL("authorize", config.issuer);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (config.audience) url.searchParams.set("audience", config.audience);
  if (input.organizationId) {
    url.searchParams.set("organization", input.organizationId);
  }
  if (input.invitation) url.searchParams.set("invitation", input.invitation);
  return url.toString();
}

export async function exchangeAuthorizationCode(
  config: AuthConfig,
  input: { code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);

  const response = await fetch(new URL("oauth/token", config.issuer), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    // Cloudflare Workers supports manual redirect handling, not "error".
    // Requiring response.ok below still rejects every redirect response.
    redirect: "manual",
  });
  if (!response.ok) {
    throw new AuthError(
      "token_exchange_failed",
      "The authorization code could not be exchanged.",
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (typeof payload.id_token !== "string") {
    throw new AuthError(
      "missing_id_token",
      "The token response did not contain an ID token.",
    );
  }
  return {
    idToken: payload.id_token,
    accessToken:
      typeof payload.access_token === "string" ? payload.access_token : null,
    expiresIn:
      typeof payload.expires_in === "number" ? payload.expires_in : null,
  };
}

export async function validateIdToken(
  token: string,
  config: AuthConfig,
  input: { nonce: string; accessToken?: string | null },
): Promise<IdTokenClaims> {
  const claims = await verifyJwt<IdTokenClaims>(token, config.issuer);
  validateStandardClaims(
    claims,
    config.issuer,
    config.clientId,
    config.clientId,
  );

  if (
    typeof claims.nonce !== "string" ||
    !constantTimeEqual(claims.nonce, input.nonce)
  ) {
    throw new AuthError("invalid_nonce", "The ID token nonce is invalid.");
  }

  if (claims.at_hash !== undefined && typeof claims.at_hash !== "string") {
    throw new AuthError(
      "invalid_access_token_hash",
      "The access token hash is invalid.",
    );
  }
  if (claims.at_hash && !input.accessToken) {
    throw new AuthError(
      "missing_access_token",
      "The ID token requires a matching access token.",
    );
  }
  if (claims.at_hash && input.accessToken) {
    const expected = encodeBase64Url(
      (await sha256(input.accessToken)).slice(0, 16),
    );
    if (!constantTimeEqual(claims.at_hash, expected)) {
      throw new AuthError(
        "invalid_access_token_hash",
        "The access token hash is invalid.",
      );
    }
  }

  return claims;
}

export async function validateAccessToken(
  token: string,
  config: AuthConfig,
): Promise<AccessTokenClaims> {
  if (!config.audience) {
    throw new AuthError(
      "missing_audience",
      "An API audience is required to validate an access token.",
      500,
    );
  }
  const claims = await verifyJwt<AccessTokenClaims>(token, config.issuer);
  validateStandardClaims(
    claims,
    config.issuer,
    config.audience,
    config.clientId,
  );
  return claims;
}

async function verifyJwt<T extends Record<string, unknown>>(
  token: string,
  issuer: string,
): Promise<T> {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new AuthError("invalid_token", "The token is not a valid JWT.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeBase64UrlJson<JwtHeader>(encodedHeader);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    // Algorithm pinning prevents accepting a token under a weaker algorithm.
    throw new AuthError(
      "invalid_token_algorithm",
      "The token must use Auth0 RS256 signing.",
    );
  }

  let keys = await getSigningKeys(issuer);
  let jwk = findSigningKey(keys, header.kid);
  if (!jwk) {
    keys = await getSigningKeys(issuer, true);
    jwk = findSigningKey(keys, header.kid);
  }
  if (!jwk) {
    throw new AuthError(
      "unknown_signing_key",
      "The token signing key is unknown.",
    );
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(decodeBase64Url(encodedSignature)),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new AuthError(
      "invalid_token_signature",
      "The token signature is invalid.",
    );
  }
  return decodeBase64UrlJson<T>(encodedPayload);
}

function validateStandardClaims(
  claims: Partial<IdTokenClaims>,
  expectedIssuer: string,
  expectedAudience: string,
  expectedAuthorizedParty: string,
): asserts claims is IdTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== undefined && typeof claims.iss !== "string") {
    throw new AuthError("invalid_issuer", "The token issuer is invalid.");
  }
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.iss !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number"
  ) {
    throw new AuthError(
      "invalid_token_claims",
      "The token is missing required claims.",
    );
  }
  if (claims.iss !== expectedIssuer) {
    throw new AuthError("invalid_issuer", "The token issuer is invalid.");
  }
  if (claims.exp <= now - CLOCK_SKEW_SECONDS) {
    throw new AuthError("expired_token", "The token has expired.");
  }
  if (claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new AuthError("future_token", "The token was issued in the future.");
  }
  if (
    typeof claims.nbf === "number" &&
    claims.nbf > now + CLOCK_SKEW_SECONDS
  ) {
    throw new AuthError("inactive_token", "The token is not yet active.");
  }

  const audiences = Array.isArray(claims.aud)
    ? claims.aud
    : typeof claims.aud === "string"
      ? [claims.aud]
      : [];
  if (!audiences.includes(expectedAudience)) {
    throw new AuthError(
      "invalid_audience",
      "The token audience is invalid.",
    );
  }
  if (
    (audiences.length > 1 || claims.azp !== undefined) &&
    claims.azp !== expectedAuthorizedParty
  ) {
    throw new AuthError(
      "invalid_authorized_party",
      "The token authorized party is invalid.",
    );
  }
}

async function getSigningKeys(
  issuer: string,
  forceRefresh = false,
): Promise<JsonWebKey[]> {
  const now = Math.floor(Date.now() / 1000);
  const cached = jwksCache.get(issuer);
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.keys;

  const response = await fetch(new URL(".well-known/jwks.json", issuer), {
    headers: { accept: "application/json" },
    redirect: "manual",
  });
  if (!response.ok) {
    throw new AuthError(
      "jwks_unavailable",
      "Auth0 signing keys are unavailable.",
      500,
    );
  }
  const payload = (await response.json()) as Partial<JsonWebKeySet>;
  if (!Array.isArray(payload.keys)) {
    throw new AuthError(
      "invalid_jwks",
      "Auth0 returned an invalid signing key set.",
      500,
    );
  }
  jwksCache.set(issuer, {
    keys: payload.keys,
    expiresAt: now + JWKS_CACHE_SECONDS,
  });
  return payload.keys;
}

function findSigningKey(
  keys: AuthJsonWebKey[],
  keyId: string,
): AuthJsonWebKey | undefined {
  return keys.find(
    (key) =>
      key.kid === keyId &&
      key.kty === "RSA" &&
      (!key.use || key.use === "sig") &&
      (!key.alg || key.alg === "RS256"),
  );
}
