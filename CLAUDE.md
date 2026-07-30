# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read these first; this file only covers what they do not:

- `AGENTS.md` — style, npm script catalog, testing policy, commit/PR format.
- `docs/modules/README.md` — module map, ownership, dependency direction, and
  the shared invariants (`workspaceId` on every record, idempotency keys,
  webhook verification, no fake provider fallbacks). Follow it literally.
- `CONTRIBUTING.md` — first checkout, required checks, migration workflow.

## Working in this repo

**Tests are `node --test` `.mjs` files importing `.ts` sources directly** (Node
≥22.13 type stripping). No framework, no test build step, no mocking library.

```bash
node --test tests/openchair-workflow.test.mjs                                  # one file
node --test --test-name-pattern "fills exactly one chair" tests/openchair-*.mjs # one test
```

Some tests assert against the *text* of source files (`tests/rendered-html.test.mjs`,
`tests/auth-config.test.mjs`), so renaming a route or deleting a string literal
can fail a test that looks unrelated to your change.

**One Worker, three entry points** (`worker/index.ts`) — a change may need
checking in more than the request path:

- `fetch` — vinext App Router (`app/`) plus the `/_vinext/image` optimizer.
- `scheduled` — every minute (`triggers.crons`): dispatches due call attempts
  and drains file-metadata delivery.
- `queue` — consumes `CALL_AUTOMATION_QUEUE`, retrying after 60s.

Application code never receives `env` as a parameter: `db/index.ts` reads the
`DB` binding from `cloudflare:workers` and returns Drizzle via `getDb()`.
Bindings are declared per environment in `wrangler.jsonc`, and declaring one
there does not create the remote resource.

**Signing in locally without Auth0** needs all three of `APP_ENV=development`,
`LOCAL_AUTH_BYPASS=true`, and `features.authentication: false`
(`isLocalAuthEnabled()` in `lib/auth/local.ts`). The committed local Wrangler
env and `config/company.json` already satisfy all three, so the persona chooser
is on by default locally and off everywhere else — flipping any one of them
turns it off. See `docs/modules/identity-and-workspaces.md`.

**Secrets go in `.env.local`, never `.env`.** Wrangler loads `.env` first, so a
stray `AUTH0_*` key there silently shadow-fills a gap and can pair one tenant's
domain with another tenant's client.

## Architecture in one paragraph

Two layers share one Worker and one D1 database. The **SaaS control plane**
(`lib/auth`, `lib/data`, `lib/billing`, `lib/uploads`, `lib/calls`,
`lib/finance`) owns identity, workspaces, roles, subscriptions, and
entitlements. The **OpenChair product** (`lib/openchair/*`) owns the
care-capacity workflow as a modular monolith. The two money paths stay
separate: a SaaS subscription entitlement is never proof that care was funded
(`docs/modules/funding-and-payments.md`). Route handlers in `app/` compose the
two — see the dependency diagram in `docs/modules/README.md`.

Conventions worth knowing before you write code:

- IDs are `createId(prefix)` from `lib/data/ids.ts`; Auth0/Stripe/Vapi IDs stay
  at the provider boundary.
- Webhooks claim through `lib/events/inbox.ts`; state and outgoing events commit
  together through `lib/events/outbox.ts`.
- Server route groups wrap in `<AuthGuard permission?>`; API handlers wrap in
  `withApiAuth(handler, permission?)` (JSON 401/403, never an HTML redirect).
  D1 is authoritative on every request — details in
  `docs/modules/identity-and-workspaces.md`.
- The workflow state machine (`lib/openchair/workflow/state-machine.ts`) is a
  pure reducer over expected versions; the UI reads only the role-safe
  projection built in `lib/openchair/projections`, which strips denied fields
  before serialization (`docs/openchair/frontend-access.md`).
- `/appointments/demo-openchair?fixture=…&role=…` renders JSON from
  `fixtures/openchair/` — preview only, never an authorization path.

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->

Never read or hand-edit `.env` or anything under `.projects/` — the Stripe
Projects CLI manages both (`.cursor/rules/stripe-projects-cli.mdc`).
