# Built Different Control Plane

A production-shaped SaaS foundation for authentication, workspaces, Stripe
subscriptions, and durable product entitlements. The future core product
integrates through stable internal IDs and versioned contracts instead of
depending directly on Auth0 or Stripe.

## What is included

- Auth0-compatible OIDC login, session, logout, and organization context
- workspace-owned Stripe Checkout and Customer Portal flows
- signed, idempotent Stripe webhook ingestion
- D1/Drizzle records for identity, membership, billing, entitlements, and events
- demo mode for development without provider credentials
- a product-facing `platform_access` entitlement

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Keep `DEMO_MODE=true` until Auth0 and Stripe
sandbox credentials are configured.

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

Create separate Auth0 applications for the control plane and future product,
but keep them in the same Auth0 tenant for SSO. Configure the control-plane
callback and logout URLs using `APP_BASE_URL`.

Create one Stripe Customer per workspace. Configure monthly and annual Price IDs
through environment variables; never accept a Stripe Price ID directly from
the browser. Point the Stripe webhook endpoint to:

```text
/api/webhooks/stripe
```

Access changes only after verified webhook processing. The Checkout return URL
is informational and never provisions access.

## Architecture and operations

- [Coordination and interfaces](docs/coordination.md)
- [Operations runbook](docs/operations.md)

