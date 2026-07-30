# Build Coordination

> This file records the original control-plane integration tracks. Current
> contributor ownership, module status, and handoff rules live in the
> [module contributor guide](modules/README.md) and
> [CONTRIBUTING.md](../CONTRIBUTING.md).

## Goal

Deliver a production-ready SaaS control plane that runs locally with real Auth0
authentication, tenant workspaces, Stripe Checkout, signed webhooks, and
durable access projection.

## Architecture Contract

- The application owns stable `userId` and `workspaceId` values.
- Auth0 owns authentication. Users are mapped by `iss + sub`; email is only
  consulted against the one-time bootstrap allowlist.
- The application owns personal and team workspaces. Live access requires an
  active membership rechecked on every protected request.
- Multiple users collaborate through separate memberships in the same team
  workspace; projects and product accounts inherit that workspace boundary.
- Local workspace roles are the authorization source of truth. Auth0 roles
  cannot bypass local tenant membership.
- Stripe owns optional payment state. One Stripe Customer belongs to one workspace.
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

Protected server routes call `requireAuthContext()`. Billing mutations
additionally call `requireWorkspacePermission("billing:manage")`. Product
access is decided by `getWorkspaceAccess(workspaceId)`. The core product reads
the active principal from `GET /api/v1/me`.

## Workstreams

| Track | Owner | Write scope | Handoff |
| --- | --- | --- | --- |
| Root integration | Primary agent | root config, `app/`, `docs/`, final integration | runnable vertical slice |
| Authentication | Auth agent | `lib/auth/`, `app/api/auth/` | Auth0 OIDC/session module with fail-closed configuration |
| Billing | Stripe agent | `lib/billing/`, `app/api/billing/`, `app/api/webhooks/stripe/` | Checkout, Portal, webhook verification and projection |
| Data and operations | Data agent | `db/`, `lib/data/`, `lib/events/`, `tests/`, `docs/operations.md` | D1 schema, repositories, event/outbox utilities, tests |

## Communication Rules

1. Agents write only in their assigned scope.
2. Cross-track interface changes are recorded below before implementation.
3. Provider credentials must never be committed.
4. Missing provider configuration must fail closed; never fabricate authentication or payment.
5. Every handoff includes changed files, exported interfaces, required dependencies, and known limitations.

## Interface Notes

- 2026-07-29: Cloudflare compatibility requires Web API-compatible authentication and webhook code.
- 2026-07-29: D1 is the deployed persistence layer; Drizzle owns schema and migrations.
- 2026-07-29: The initial feature key is `platform_access`.
- 2026-07-29: The repository is local-only and detached from ChatGPT Sites.
- 2026-07-29: `config/company.json` is the non-secret company configuration source.
- 2026-07-29: SaaS tenancy uses app-owned memberships and supports personal and team workspaces.
- 2026-07-29: `docs/multi-user-collaboration.md` defines shared-workspace and future project isolation rules.
- 2026-07-30: Image uploads use server-generated workspace-scoped Cloudflare R2
  keys, conditional writes, and `image.upload.completed.v1` outbox delivery.

## Status

- [x] Starter initialized and local preview running.
- [x] Authentication track integrated.
- [x] Billing track integrated.
- [x] Data/operations track integrated.
- [x] Dashboard vertical slice complete.
- [x] Multi-user workspace and role contract documented.
- [x] Build, lint, and tests passing.
- [ ] Production host selected and reviewed.
