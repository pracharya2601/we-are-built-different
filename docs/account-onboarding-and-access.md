# Account Onboarding and Access Policy

## Account types

| Account type | Initial workspace | Initial role | Nested roles | Plan policy |
| --- | --- | --- | --- | --- |
| Service provider | Team | Administrator | Admin, billing admin, member | Pro, $20/month; required before dashboard |
| Nonprofit or sponsor | Team | Administrator | Admin, billing admin, member | Lite or Pro; dashboard is not subscription-gated |
| Beneficiary | Personal | Administrator | None | Lite or Pro; user chooses through normal billing |

The sign-in intent selects the account workflow but never grants access by
itself. Auth0 verifies identity, D1 stores the active workspace membership and
account type, and Stripe webhooks project subscription access.

Legacy `benefactor` and `other` sign-in intents normalize to `nonprofit` and
`beneficiary` so old entry links continue to work.

## Service-provider onboarding

1. The user selects Service provider and completes Auth0 sign-in.
2. The identity adapter creates a team workspace with the user as `admin`.
3. Dashboard access checks the workspace `platform_access` entitlement.
4. An inactive workspace is redirected to `/onboarding/subscription`.
5. Checkout accepts only the server-configured `platform-pro` Price.
6. The Stripe return page waits for a signed webhook to activate access.
7. The user enters the dashboard and can create workspaces, add verified users,
   assign nested roles, and configure granular permission overrides.

Browser returns never activate access. `active`, `trialing`, and unexpired
`grace` states permit dashboard access; every other state fails closed.

## Granular permissions

Roles provide a baseline. An administrator with `members:manage` can set the
desired effective permissions for a non-owner member. The API stores only the
differences as `allow` or `deny` records.

The canonical permissions are:

- `workspace:view`
- `workspace:manage`
- `members:manage`
- `billing:manage`
- `funds:view`
- `funds:manage`
- `product:use`

The backend recalculates effective permissions from the active membership plus
overrides on every protected request. Owner access cannot be changed by an
administrator. Administrators cannot change their own role or granular access,
active members must retain `workspace:view`, and every workspace must keep at
least one active owner or administrator. Every granular change writes an audit
event.

## Core-product token contract

Verified Auth0 ID-token and access-token role claims are normalized to known
workspace roles. Access-token permissions are also parsed and retained as token
assertions. `GET /api/v1/me` returns:

- stable internal `user.id`;
- active `workspace.id` and `workspace.accountType`;
- authoritative local roles and effective permissions;
- verified token role and permission assertions in a separate object.

The core product must use the authoritative effective permissions for
authorization and must include `workspaceId` in queries, events, cache keys,
jobs, and storage paths. Token assertions are useful for diagnostics and
initial organization provisioning, but they do not replace tenant-scoped D1
membership checks.

`AUTH0_AUDIENCE` is mandatory. It must be the exact identifier of the Auth0 API
that issues the core-product access token; the application fails closed at the
authentication setup screen when this value is absent.
