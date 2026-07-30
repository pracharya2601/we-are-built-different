# Identity and workspace module

## Status

Live. Auth0-compatible OIDC, encrypted sessions, account onboarding,
workspace membership, role/permission checks, switching, and immediate
suspension are implemented.

Local development can use the explicit three-persona identity provider when
all of these conditions are true:

- `APP_ENV=development`;
- `LOCAL_AUTH_BYPASS=true`;
- `features.authentication=false` in `config/company.json`.

The chooser provisions real local D1 users, workspaces, and memberships for a
service provider, platform owner, and beneficiary. It bypasses only external
identity verification. Membership, effective-permission, tenant, entitlement,
and platform-operator checks remain active. The staging Wrangler environment
does not define `LOCAL_AUTH_BYPASS`, so it remains fail-closed on Auth0.

## Owns

- Auth0/OIDC configuration and callback flow.
- Stable internal identity mapping from verified `iss + sub`.
- Personal and team workspaces.
- Active workspace membership and effective permissions.
- Account-type policy and sign-in intent.
- Durable platform-operator authorization.

It does not own subscription truth, appointment workflow state, participant
roles, or provider payment/call outcomes.

## Code map

- `lib/auth`: OIDC, cookies, sessions, guards, authorization policy.
- `lib/auth/local.ts`: localhost-only persona provisioning and selection.
- `lib/accounts`: account types and plan policy.
- `lib/data/auth.ts`, `users.ts`, `workspaces.ts`, `permissions.ts`: D1
  identity and membership operations.
- `lib/data/platform-operators.ts`: durable platform-owner records.
- `app/api/auth`: login, callback, session, logout.
- `app/auth/select-role`: the local three-user chooser.
- `app/api/v1/me`: active principal contract.
- `app/api/v1/workspaces`: workspace and member APIs.
- `app/dashboard/workspaces`, `app/dashboard/settings`: management UI.
- `tests/authorization.test.mjs`, `tests/sign-in-intent.test.mjs`,
  `tests/account-policy.test.mjs`.

## Public contracts

Protected server components call `requireAuthContext()` or a specific guard.
Protected API routes use `withApiAuth(handler, permission)`. Platform-wide
owner APIs use `withPlatformOwner`.

The active context supplies stable `userId`, `workspaceId`, account type,
effective local roles, and permissions. Token claims are retained only for
diagnostics and initial organization provisioning.

## Rules for changes

- Never authorize from email, an Auth0 role alone, or client-supplied
  `workspaceId`.
- Recheck the current D1 membership on every protected request.
- Keep account type separate from workspace role.
- Preserve last-owner/administrator and self-lockout protections.
- New permissions must be added to the canonical type, role matrix, API guard,
  settings UI, and tests together.
- A verified bootstrap email may create an internal owner/operator row once;
  later authorization uses the internal row.

## Contributor workflow

1. Update the shared authorization type or account policy first.
2. Add or change the D1 repository operation.
3. Enforce the permission in the server route before reading tenant data.
4. Update `/api/v1/me` only if its versioned public contract changes.
5. Add denial tests, not only happy-path tests.

Verify:

```bash
npm run typecheck
node --test tests/authorization.test.mjs tests/sign-in-intent.test.mjs tests/account-policy.test.mjs
npm run build
```
