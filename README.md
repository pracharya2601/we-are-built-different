# OpenChair Care Capacity Control Plane

OpenChair’s current operational foundation for authentication, tenant
workspaces, participant roles, sponsor funding records, optional Stripe
billing, and durable access state. It runs on localhost while the care-capacity
experience is developed separately.

## What is included

- Auth0-compatible OIDC login, session, logout, and optional organization pinning
- service-provider, nonprofit, and beneficiary account policies
- personal and team workspaces with fail-closed membership checks
- owner, administrator, billing administrator, and member roles
- per-member granular permission overrides with audited changes
- workspace creation, switching, member provisioning, and immediate suspension
- benefactor, beneficiary, and service-provider participant records
- workspace funding pools with balanced, immutable ledger entries
- optional Stripe Checkout and Customer Portal flows
- signed, idempotent Stripe webhook ingestion
- private, workspace-scoped Cloudflare R2 image uploads
- verified upload completion with durable file-metadata delivery
- owner-only, encrypted, queue-backed Vapi call automation
- OpenChair appointment, workflow, beneficiary, outreach, and projection
  contracts with deterministic fixture previews
- appointment funding: approval, sponsor/patient Checkout, refunds, and a
  separately signed Stripe webhook, kept apart from SaaS subscriptions
- D1/Drizzle records for identity, membership, billing, entitlements, and events
- a product-facing `platform_access` entitlement
- a validated pricing router for catalog or dynamic monthly Checkout amounts

## Local development

```bash
cp .env.example .env.local
npm ci
npm run db:migrate:local
npm run dev
```

Open `http://localhost:3000`. Auth0 is the only way to obtain a session, in
every environment including localhost — there is no development bypass or
persona chooser. Sign-in fails closed at `/auth/setup` until the Auth0
variables in `.env.local` are complete.

Stripe-backed billing and Vapi-backed calls fail closed until their complete
local configuration is present. Tests never create fake provider results or
contact live providers.

To smoke-test the built Worker with the local Cloudflare bindings, run:

```bash
npm run build
npm run start
```

The `start` command uses Wrangler because the generated Worker depends on
Cloudflare runtime modules and D1 bindings that a plain Node preview cannot
provide.

## Company configuration

Edit [`config/company.json`](config/company.json) to change company identity,
branding, workspace defaults, feature flags, or the product entitlement key.
Secrets never belong in this file; keep them in ignored `.env.local`.

With `features.multiTenant` enabled, the sign-in path chooses an explicit
account policy. Service providers and nonprofits receive collaborative team
workspaces and start as administrators. Beneficiaries receive private
single-user workspaces without nested roles. A team administrator can add an
account after that user has completed one verified Auth0 login. For
organization-managed tenants, pass the Auth0 Organization ID through login;
verified token role claims can seed a new local membership, while D1 remains
authoritative on every request.

Service-provider dashboard access requires the allowlisted $20 Pro plan.
Beneficiaries can choose Lite or Pro through the normal billing screen.
Subscription access changes only after a verified Stripe webhook updates the
workspace entitlement.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Generate a D1 migration after schema changes with:

```bash
npm run db:generate
```

## Provider configuration

Configure the OpenChair Auth0 application’s callback and logout URLs from
`AUTH0_APP_BASE_URL`. `AUTH0_AUDIENCE` is optional: leave it unset to sign in
with the ID token alone, or set it to the identifier of an API that already
exists in the tenant so the access token can carry verified roles and
permissions as assertions. Either way, authorization comes from D1 membership
roles, never from token claims. See
[account onboarding and access](docs/account-onboarding-and-access.md) for the
setup and the verification command.

Configure allowlisted Stripe Price IDs through environment variables; never
accept a Price ID from the browser. During localhost development, run the
Stripe CLI listener and copy its signing secret to `.env.local`:

```bash
npm run stripe:listen
```

Access changes only after verified webhook processing. The Checkout return URL
is informational and never provisions access. Follow the
[Stripe sandbox setup](docs/stripe-setup.md) to create the product catalog,
configure the customer portal, and verify the complete subscription lifecycle.

## Protected routes

Wrap protected server-rendered route groups with `AuthGuard`; it redirects
unconfigured environments to `/auth/setup`, anonymous users to Auth0, and
unauthorized roles to `/auth/forbidden`.

```tsx
<AuthGuard returnTo="/dashboard">{children}</AuthGuard>
```

Wrap protected API handlers with `withApiAuth(handler, permission?)`. API
failures return JSON `401` or `403` responses rather than HTML redirects.

Future OpenChair services can read the current tenant contract from
`GET /api/v1/me` and paid access from
`GET /api/v1/workspaces/:workspaceId/entitlements`. Never authorize from Auth0
email, frontend state, or Stripe return URLs.

`GET /api/v1/me` returns the active local role, effective granular
permissions, account type, and the role/permission assertions extracted from
the verified authorization token. Core-product APIs should authorize with the
effective local permissions and preserve `workspaceId` on every record.

## Deployment status

This repository is intentionally detached from ChatGPT Sites. Cloudflare
Workers staging is configured with an isolated D1 database; production remains
unconfigured until staging is verified and a canonical HTTPS origin is chosen.

The current staging Worker is available at:

```text
https://built-different-control-plane-staging.pracharya2601.workers.dev
```

Authenticate Wrangler to the intended Cloudflare account, configure the staging
provider variables and secrets, then inspect and apply pending migrations:

```bash
npm run db:migrations:list:staging
npm run db:migrate:staging
npm run deploy:staging:dry-run
```

`npm run deploy:staging` is a live deployment and should run only after the
staging account, bindings, variables, and secrets have been reviewed.

## Architecture and operations

- [Contributor guide](CONTRIBUTING.md)
- [Module ownership and development index](docs/modules/README.md)
- [Product roles and contributor journeys](docs/modules/product-roles.md)
- [Multi-user collaboration contract](docs/multi-user-collaboration.md)
- [External backend authorization — LLM context](docs/external-backend-authorization-llm-context.md)
- [Account onboarding and access policy](docs/account-onboarding-and-access.md)
- [Funds and participant records](docs/funds-and-participants.md)
- [Coordination and interfaces](docs/coordination.md)
- [Operations runbook](docs/operations.md)
- [Cloudflare R2 image uploads](docs/image-uploads.md)
- [OpenChair MVP scaffold](docs/openchair/README.md)
