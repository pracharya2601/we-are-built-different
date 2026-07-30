# Build Coordination

## Goal

Deliver a production-shaped SaaS control plane that runs without provider credentials in demo mode and becomes live when Auth0, Stripe, and Sites environment variables are configured.

## Architecture Contract

- The application owns stable `userId` and `workspaceId` values.
- Auth0 owns authentication. Users are mapped by `iss + sub`; email is never a join key.
- Stripe owns payment state. One Stripe Customer belongs to one workspace.
- Effective access is the local `platform_access` entitlement projection.
- The future product consumes internal IDs and entitlement APIs/events, never provider IDs.
- All provider mutations and webhook processing must be idempotent.

## Shared Interfaces

```ts
type AuthContext = {
  userId: string;
  workspaceId: string;
  subject: string;
  email: string | null;
  roles: Array<"owner" | "admin" | "billing_admin" | "member">;
};

type AccessState =
  | "active"
  | "trialing"
  | "grace"
  | "inactive";
```

Protected server routes call `requireAuthContext()`. Billing mutations additionally call `requireWorkspacePermission("billing:manage")`. Product access is decided by `getWorkspaceAccess(workspaceId)`.

## Workstreams

| Track | Owner | Write scope | Handoff |
| --- | --- | --- | --- |
| Root integration | Primary agent | root config, `app/`, `docs/`, final integration | runnable vertical slice |
| Authentication | Auth agent | `lib/auth/`, `app/api/auth/` | Auth0 OIDC/session module with demo fallback |
| Billing | Stripe agent | `lib/billing/`, `app/api/billing/`, `app/api/webhooks/stripe/` | Checkout, Portal, webhook verification and projection |
| Data and operations | Data agent | `db/`, `lib/data/`, `lib/events/`, `tests/`, `docs/operations.md` | D1 schema, repositories, event/outbox utilities, tests |

## Communication Rules

1. Agents write only in their assigned scope.
2. Cross-track interface changes are recorded below before implementation.
3. Provider credentials must never be committed.
4. Demo behavior must be visibly labeled and must never fabricate a successful live payment.
5. Every handoff includes changed files, exported interfaces, required dependencies, and known limitations.

## Interface Notes

- 2026-07-29: Cloudflare/Sites compatibility requires Web API-compatible authentication and webhook code.
- 2026-07-29: D1 is the deployed persistence layer; Drizzle owns schema and migrations.
- 2026-07-29: The initial feature key is `platform_access`.

## Status

- [x] Starter initialized and local preview running.
- [x] Authentication track integrated.
- [x] Billing track integrated.
- [x] Data/operations track integrated.
- [x] Dashboard vertical slice complete.
- [x] Build, lint, and tests passing.
- [ ] Production version deployed.
