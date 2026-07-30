/**
 * Presentation for a failed sign-in.
 *
 * Auth0 reports callback failures as `error`/`error_description` query
 * parameters on a browser redirect. That text is provider-controlled, so it is
 * logged server-side for diagnosis and never reflected into the page: an
 * attacker-crafted callback link must not be able to put its own words on a
 * page that carries our branding. The page renders copy chosen here from our
 * own failure code instead.
 */

export const AUTH_FAILURE_PATH = "/auth/error";

export type AuthFailureCopy = {
  title: string;
  detail: string;
  /** Whether retrying the same sign-in could plausibly succeed. */
  retryable: boolean;
};

const FAILURE_COPY: Record<string, AuthFailureCopy> = {
  missing_transaction: {
    title: "Your sign-in request expired.",
    detail:
      "Sign-in requests are valid for ten minutes. Start a new one to continue.",
    retryable: true,
  },
  invalid_state: {
    title: "The sign-in request could not be verified.",
    detail:
      "The response did not match the request that started it. Start a new sign-in from this device.",
    retryable: true,
  },
  authorization_failed: {
    title: "Auth0 did not complete the sign-in.",
    detail:
      "The identity provider ended the request without authorizing it. The reason was recorded in the server log.",
    retryable: true,
  },
  organization_mismatch: {
    title: "The authenticated organization does not match the request.",
    detail:
      "Sign in again from the workspace you intended to open.",
    retryable: true,
  },
  membership_required: {
    title: "Your account has no authorized workspace.",
    detail:
      "Authentication succeeded, but no active membership grants access. Ask a workspace owner for an invitation.",
    retryable: false,
  },
};

const FALLBACK_COPY: AuthFailureCopy = {
  title: "Sign-in could not be completed.",
  detail:
    "The login callback failed. The reason was recorded in the server log.",
  retryable: true,
};

/**
 * Every AuthError code that can end a sign-in. Most have no distinct user
 * meaning -- "the token signature is invalid" is not actionable advice -- but
 * they must survive to the page so the failure is diagnosable without reading
 * the server log. Codes outside this set never render: the page reads `code`
 * from the query string, so an arbitrary value would be attacker-supplied text.
 */
const AUTH_FAILURE_CODES: ReadonlySet<string> = new Set([
  // callback route
  "missing_transaction",
  "invalid_state",
  "authorization_failed",
  "unexpected_callback",
  "callback_failed",
  "membership_required",
  // login/flow
  "invalid_organization",
  "invalid_invitation",
  "missing_invitation_organization",
  "invalid_token_organization",
  "organization_mismatch",
  "access_token_identity_mismatch",
  // token exchange
  "token_exchange_failed",
  "missing_id_token",
  "missing_access_token",
  // token validation
  "invalid_token",
  "invalid_token_algorithm",
  "invalid_token_signature",
  "invalid_token_claims",
  "invalid_nonce",
  "invalid_access_token_hash",
  "invalid_issuer",
  "invalid_audience",
  "invalid_authorized_party",
  "missing_audience",
  "expired_token",
  "future_token",
  "inactive_token",
  // signing keys
  "unknown_signing_key",
  "jwks_unavailable",
  "invalid_jwks",
]);

export function describeAuthFailure(
  code: string | null | undefined,
): AuthFailureCopy {
  const normalized = normalizeAuthFailureCode(code);
  if (!normalized) return FALLBACK_COPY;
  // The own-property check matters: a bare lookup of an inherited key such as
  // `__proto__` or `toString` returns a truthy non-copy value.
  return Object.hasOwn(FAILURE_COPY, normalized)
    ? FAILURE_COPY[normalized]
    : FALLBACK_COPY;
}

/** Only codes this module publishes may reach the page. */
export function normalizeAuthFailureCode(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return AUTH_FAILURE_CODES.has(code) ? code : null;
}

export function authFailurePath(
  code: string,
  returnTo?: string | null,
): string {
  const params = new URLSearchParams();
  const normalized = normalizeAuthFailureCode(code);
  if (normalized) params.set("code", normalized);
  if (returnTo) params.set("returnTo", returnTo);
  const query = params.toString();
  return query ? `${AUTH_FAILURE_PATH}?${query}` : AUTH_FAILURE_PATH;
}

/**
 * A browser following an Auth0 redirect asks for HTML; API and fetch callers
 * do not. Only the former gets a rendered page, so machine callers keep the
 * existing JSON error contract.
 */
export function prefersHtml(accept: string | null | undefined): boolean {
  if (!accept) return false;
  return accept
    .split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/html"));
}
