# External Backend Authorization — LLM Context

This document is the source-of-truth handoff for an engineer or LLM connecting
another backend to OpenChair authorization. It describes the contract that
exists today, the data a backend needs, how roles and permissions are resolved,
and the missing server-to-server boundary that must be implemented before a
separate service can authorize requests directly.

## Short version

OpenChair separates authentication, tenant authorization, and paid access:

```text
Auth0 token
  -> verifies the external identity (`iss + sub`)
  -> OpenChair maps the identity to an internal `userId`
  -> OpenChair selects and rechecks the active `workspaceId`
  -> D1 membership supplies the authoritative local role
  -> D1 overrides produce effective permissions
  -> D1 entitlement supplies product access
  -> the product backend scopes every operation to `workspaceId`
```

Auth0 answers **who authenticated**. OpenChair D1 answers **which tenant the
user may access and what the user may do there**. Stripe-derived entitlements
answer **whether gated product access is currently active**.

Never authorize a product request from email, browser state, a requested
workspace ID, Stripe return parameters, or Auth0 role claims alone.

## Current implementation status

### Available now

- Auth0 Authorization Code + PKCE login.
- RS256 token verification against Auth0 JWKS.
- Required issuer, audience, expiry, issued-at, authorized-party, nonce, and
  organization checks.
- Stable internal identity mapping using the Auth0 `iss + sub` pair.
- Active local workspace membership checks on every protected request.
- Local roles plus granular allow/deny permission overrides.
- Active workspace switching with membership revalidation.
- `GET /api/v1/me` for the resolved principal.
- `GET /api/v1/workspaces/:workspaceId/entitlements` for product access.

### Important limitation

Both endpoints currently authenticate with OpenChair's encrypted host-only
session cookie:

```text
__Host-bd_session
HttpOnly
Secure
SameSite=Lax
Path=/
```

This works for the OpenChair application and its same-origin API routes. A
separate backend cannot safely call these endpoints with its own service
identity, because OpenChair does not yet implement:

- bearer-token authentication on `/api/v1/*`;
- a service-to-service authorization/introspection credential; or
- a short-lived signed OpenChair principal token.

Do not copy, parse, expose, or share `__Host-bd_session`. Do not accept a
`/api/v1/me` response sent by the browser as proof of authorization.

Before a separate backend directly relies on OpenChair authorization, implement
one reviewed machine-to-machine boundary. The recommended choices are:

1. accept the user's Auth0 API access token and resolve it through an
   authenticated OpenChair introspection endpoint; or
2. have OpenChair mint a short-lived, audience-bound internal JWT containing
   the resolved local authorization context.

In both designs, OpenChair must remain authoritative for active membership,
effective permissions, and entitlements.

## Data the product backend needs

The minimum resolved principal is:

```ts
type OpenChairPrincipal = {
  version: 1;
  user: {
    id: string; // stable internal ID, e.g. usr_<32 lowercase hex>
    email: string | null; // display/contact only; never an authorization key
  };
  workspace: {
    id: string; // tenant key, e.g. wsp_<32 lowercase hex>
    name: string;
    slug: string;
    type: "personal" | "team";
    accountType: "service_provider" | "nonprofit" | "beneficiary";
  };
  authorization: {
    roles: Array<"owner" | "admin" | "billing_admin" | "member">;
    permissions: Array<
      | "workspace:view"
      | "workspace:manage"
      | "billing:manage"
      | "funds:view"
      | "funds:manage"
      | "members:manage"
      | "product:use"
    >;
    tokenAssertions: {
      roles: Array<"owner" | "admin" | "billing_admin" | "member">;
      permissions: string[];
    };
  };
};
```

For a product mutation, also retain:

- the required permission for that operation;
- the resource's stored `workspaceId`;
- `user.id` as the actor;
- entitlement state when the feature is subscription-gated;
- an idempotency key for retryable writes;
- a request/correlation ID for audit and tracing.

Provider identifiers such as Auth0 `sub`, Auth0 Organization ID, Stripe
Customer ID, and Stripe Subscription ID must not become product foreign keys.

## Resolved principal endpoint

### Request

```http
GET /api/v1/me
Cookie: __Host-bd_session=<opaque encrypted value>
Accept: application/json
```

The current request must carry a valid OpenChair session cookie. The endpoint
then rechecks that the internal user, workspace, and membership are all active
in D1 and recalculates effective permissions.

### Successful response

```json
{
  "version": 1,
  "user": {
    "id": "usr_0123456789abcdef0123456789abcdef",
    "email": "person@example.com"
  },
  "workspace": {
    "id": "wsp_0123456789abcdef0123456789abcdef",
    "name": "Example Dental Group",
    "slug": "example-dental-group",
    "type": "team",
    "accountType": "service_provider"
  },
  "authorization": {
    "roles": ["admin"],
    "permissions": [
      "workspace:view",
      "workspace:manage",
      "billing:manage",
      "funds:view",
      "funds:manage",
      "members:manage",
      "product:use"
    ],
    "tokenAssertions": {
      "roles": ["admin"],
      "permissions": ["read:profile"]
    }
  }
}
```

Responses use `Cache-Control: private, no-store`.

### Which fields authorize

Use:

- `user.id` as the actor ID;
- `workspace.id` as the tenant ID;
- `workspace.accountType` for account-policy decisions;
- `authorization.permissions` for operation-level authorization;
- `authorization.roles` only when a role-specific rule cannot be represented
  as a permission.

Do not authorize from:

- `user.email`;
- `workspace.slug`;
- `authorization.tokenAssertions`;
- an Auth0 role/permission claim read by the frontend.

`tokenAssertions` are retained verified provider assertions for diagnostics and
initial Auth0 Organization provisioning. They do not bypass local membership
or local permission overrides.

## Roles and effective permissions

The base role policy is:

| Local role | Effective permissions before overrides |
| --- | --- |
| `owner` | `workspace:view`, `workspace:manage`, `members:manage`, `billing:manage`, `funds:view`, `funds:manage`, `product:use` |
| `admin` | `workspace:view`, `workspace:manage`, `members:manage`, `billing:manage`, `funds:view`, `funds:manage`, `product:use` |
| `billing_admin` | `workspace:view`, `billing:manage`, `product:use` |
| `member` | `workspace:view`, `product:use` |

OpenChair recalculates:

```text
effective permissions
  = permissions granted by the active local role
  + explicit local allow overrides
  - explicit local deny overrides
```

Therefore, the consuming backend should test the returned effective permission:

```ts
function requirePermission(
  principal: OpenChairPrincipal,
  required: OpenChairPrincipal["authorization"]["permissions"][number],
): void {
  if (!principal.authorization.permissions.includes(required)) {
    throw new ForbiddenError(`Missing permission: ${required}`);
  }
}
```

Do not reconstruct permissions from the role in the consuming backend. That
would ignore granular overrides and make policy changes require synchronized
deployments across services.

## Entitlement endpoint

Permissions and subscriptions are independent checks. When a feature requires
paid product access, query the active workspace:

```http
GET /api/v1/workspaces/wsp_0123456789abcdef0123456789abcdef/entitlements
Cookie: __Host-bd_session=<opaque encrypted value>
Accept: application/json
```

The path `workspaceId` must exactly equal the session's active workspace.

Example response:

```json
{
  "workspaceId": "wsp_0123456789abcdef0123456789abcdef",
  "revision": 1,
  "entitlements": [
    {
      "key": "platform_access",
      "state": "active",
      "active": true
    }
  ]
}
```

Entitlement states are:

```ts
type AccessState = "active" | "trialing" | "grace" | "inactive";
```

For `platform_access`, access is allowed only when `active` is `true`, which
currently corresponds to `active`, `trialing`, or unexpired `grace`.

Never activate access from a Checkout return URL. Stripe webhook verification
updates the local entitlement projection; the local projection is the
authorization input.

## Authorization algorithm for every product request

Use this order:

1. Authenticate the request through a supported trusted boundary.
2. Resolve the current OpenChair principal.
3. Reject if the user, workspace, or membership is no longer active.
4. Read `workspace.id` from the resolved principal, never from request JSON.
5. Check the operation's required effective permission.
6. Check `platform_access` when the product feature requires it.
7. Query the resource by both resource ID and `workspaceId`.
8. For mutations, record `user.id` as the actor.
9. Include `workspaceId` in events, jobs, cache keys, storage keys, analytics,
   and audit records.
10. Return a generic `403` or `404` for cross-workspace resources without
    leaking whether the resource exists.

Example repository pattern:

```ts
async function getAppointment(
  db: Database,
  principal: OpenChairPrincipal,
  appointmentId: string,
) {
  requirePermission(principal, "product:use");

  return db.appointments.findFirst({
    where: {
      id: appointmentId,
      workspaceId: principal.workspace.id,
    },
  });
}
```

Unsafe pattern:

```ts
// Never load globally and compare only in the browser.
const appointment = await db.appointments.findById(request.appointmentId);
```

## Authentication failures

Treat failures as fail-closed:

| Condition | Expected outcome |
| --- | --- |
| Missing, invalid, or expired authentication | `401 Unauthorized` |
| Valid Auth0 identity but inactive/missing local membership | `403 Forbidden` |
| Missing effective permission | `403 Forbidden` |
| Requested workspace differs from active workspace | `403 Forbidden` |
| Missing or inactive required entitlement | `403 Forbidden` |
| Tenant-scoped resource not found | `404 Not Found` |
| Stale optimistic-concurrency revision | `409 Conflict` |

Current protected OpenChair APIs normally return:

```json
{
  "error": {
    "code": "permission_denied",
    "message": "The required workspace permission is required."
  }
}
```

Never fall back to anonymous, demo, or default-tenant access when
authentication configuration or authorization resolution fails.

## Auth0 claim extraction

OpenChair currently extracts and verifies these provider claims during login:

| Claim | Purpose |
| --- | --- |
| `iss` + `sub` | Stable external identity mapping |
| `aud` | Must contain the configured `AUTH0_AUDIENCE` |
| `azp` | Must match the configured client when present or required |
| `exp`, `iat`, `nbf` | Token lifetime validation with limited clock skew |
| `org_id` | Auth0 Organization boundary; must match the login transaction |
| configured roles claim | Defaults to `https://built-different.app/roles` |
| configured permissions claim | Defaults to `permissions` |

Only RS256 is accepted. Signing keys come from the Auth0 JWKS endpoint and are
selected by `kid`. The ID token and access token must resolve to the same `sub`
and organization.

If another backend independently verifies an Auth0 access token, it needs:

- the Auth0 HTTPS issuer/domain;
- the exact API audience;
- the expected authorized party/client ID when applicable;
- the configured roles and permissions claim names;
- JWKS retrieval and key-rotation handling;
- RS256 algorithm pinning;
- issuer, audience, signature, `exp`, `iat`, `nbf`, and `azp` validation.

It does **not** need the OpenChair Auth0 client secret, session secret, Stripe
secret, or browser cookie. Those secrets must never be shared.

Even after valid JWT verification, the backend still needs OpenChair's current
local authorization resolution. A valid Auth0 token by itself is insufficient.

## Required machine-to-machine contract

Before direct external-backend integration, define and implement a contract
similar to:

```ts
type AuthorizationDecisionRequest = {
  accessToken: string; // supplied as Authorization: Bearer, not JSON
  activeWorkspaceId: string;
  requiredPermission?: string;
  requiredEntitlement?: string;
};

type AuthorizationDecision = {
  version: 1;
  allowed: boolean;
  userId: string;
  workspaceId: string;
  accountType: "service_provider" | "nonprofit" | "beneficiary";
  roles: string[];
  permissions: string[];
  entitlements: Array<{
    key: string;
    state: "active" | "trialing" | "grace" | "inactive";
    active: boolean;
  }>;
  issuedAt: number;
  expiresAt: number;
};
```

Security requirements for that boundary:

- TLS only.
- Authenticate both the user token and the calling backend.
- Never accept local roles or permissions from the caller.
- Resolve `iss + sub` to the internal user.
- Recheck active user, workspace, and membership in D1.
- Recalculate granular overrides.
- Reject an unowned `activeWorkspaceId`.
- Bind any signed decision to a specific audience.
- Keep decisions short-lived; do not outlive the user token.
- Support key rotation and explicit token versioning.
- Log metadata and internal IDs, never raw bearer tokens or cookies.
- Rate-limit and audit decision requests.

## LLM implementation instructions

When using this file as context for an implementation LLM, give it the
following directive:

> Implement authorization without changing the trust model in this document.
> Auth0 proves identity, but OpenChair D1 membership and permission overrides
> are authoritative. Never authorize from email, browser-supplied roles,
> token assertions alone, or a client-supplied workspace ID. Preserve
> `workspaceId` in every query and side effect. Fail closed. If the requested
> server-to-server credential or signed principal boundary does not exist,
> identify that gap explicitly instead of fabricating authentication.

Relevant implementation sources:

- `lib/auth/oidc.ts` — Auth0 JWT verification and claim extraction.
- `lib/auth/context.ts` — session resolution and current membership recheck.
- `lib/auth/authorization.ts` — role and effective-permission policy.
- `lib/auth/guards.tsx` — protected page and API behavior.
- `lib/data/auth.ts` — external identity to local user/workspace resolution.
- `lib/data/workspaces.ts` — active membership and workspace access.
- `lib/data/access.ts` — local entitlement resolution.
- `app/api/v1/me/route.ts` — resolved principal response.
- `app/api/v1/workspaces/[workspaceId]/entitlements/route.ts` — entitlement
  response and active-workspace enforcement.
