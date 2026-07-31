# OpenChair

OpenChair turns canceled healthcare appointments into privately claimed,
sponsor-funded care—starting with dental.

When a clinic receives a last-minute cancellation, the chair normally sits
empty while someone nearby may be waiting for care they cannot afford.
OpenChair lets the clinic release that opening at a reduced price, lets a
community sponsor fund part of the care, and helps one eligible patient claim
the appointment privately. The clinic recovers useful capacity, the sponsor
funds a specific care opportunity, and the patient receives treatment without
public fundraising.

## How the product works

The OpenChair journey is **release, fund, match, contact, and fill**:

1. **A clinic releases a chair.** A service provider publishes an available
   appointment with its time, treatment, location, discounted price, funding
   split, and claim cutoff.
2. **Eligible patients are shortlisted.** A nonprofit verifies beneficiaries
   and orders candidates who are available, have the required consent, and are
   in the same city as the clinic. Missing or mismatched location data fails
   closed.
3. **A sponsor funds its share.** An approved sponsor contribution is collected
   through Stripe Checkout. OpenChair waits for a signed Stripe webhook before
   treating the contribution as paid.
4. **Candidates are contacted privately.** Consent-aware outreach contacts
   candidates in order. Vapi can provide the call transport, but its output
   cannot reserve a patient by itself.
5. **One patient is reserved.** The versioned workflow accepts only one
   candidate, preventing two simultaneous acceptances from filling the same
   chair.
6. **The patient pays the remaining share.** Patient Checkout begins only
   after reservation. A second verified Stripe event confirms the payment.
7. **The chair is filled.** OpenChair reaches `CHAIR_FILLED` only when one
   patient is reserved and both required contributions are verified. The
   clinic can then complete or cancel the visit.

The browser never declares an appointment paid, chooses the official workflow
stage, or writes directly to the database. Checkout returns, visible buttons,
AI call outcomes, and client-supplied workspace IDs are signals—not proof.
Authoritative changes happen in workspace-scoped backend commands after the
relevant membership, permission, relationship, workflow version, consent, and
provider event have been checked.

### Who uses OpenChair

| Product participant | Role in the care journey |
| --- | --- |
| Clinic or service provider | Releases canceled appointments, manages availability, and delivers care |
| Nonprofit staff | Verifies beneficiaries, reviews eligibility, and orders candidates |
| Sponsor | Approves and pays the sponsor contribution for an appointment |
| Beneficiary or patient | Gives consent, privately accepts an opening, and pays any patient share |
| Platform operator | Monitors automation and operational failures without becoming a workspace administrator |

Product participants are not the same as workspace authorization roles. For
example, `sponsor` describes a relationship to one appointment, while
`admin`, `billing_admin`, and `member` describe what a person may do inside a
workspace. Both the workspace permission and the appointment relationship must
be valid when an action requires both.

## What this repository implements

This repository is the operational control plane and current MVP vertical
slice. It is a vinext/TypeScript modular monolith running as a Cloudflare
Worker, with D1/Drizzle persistence and provider integrations kept behind
internal ports.

Implemented foundations include:

- Auth0 OIDC login, encrypted sessions, logout, and optional Organization
  assertions;
- personal and collaborative tenant workspaces with audited roles, granular
  permission overrides, switching, provisioning, and immediate suspension;
- service-provider, nonprofit, and beneficiary account policies;
- durable appointment and versioned workflow records with idempotent commands,
  history, and outbox effects;
- city-scoped eligibility and matching rules with consent-aware beneficiary
  contracts;
- sponsor and patient appointment-funding requests, Stripe Checkout, verified
  payments, refunds, and append-only funding records;
- a separate Stripe SaaS subscription system that projects the
  `platform_access` entitlement for a workspace;
- workspace funding pools, benefactor deposits, and balanced immutable ledger
  entries;
- clinic-wide Google Calendar availability and appointment synchronization;
- private, workspace-scoped Cloudflare R2 image uploads;
- encrypted, queue-backed Vapi call automation with authenticated callbacks;
- role-safe appointment projections that limit both visible data and available
  actions; and
- deterministic service, security, tenant-isolation, workflow, and provider
  contract tests.

The appointment workflow and infrastructure are active development areas.
Beneficiary management UI, production candidate ordering, and the complete
OpenChair outreach persistence/dispatch loop are not yet finished. Stripe
Connect payouts are also intentionally outside the current MVP: a verified
Checkout means funds were collected, not that a clinic was paid.

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

## How Auth0, Stripe, and application access fit together

OpenChair deliberately keeps identity, authorization, and billing as separate
security decisions:

| System | What it answers | What it cannot grant by itself |
| --- | --- | --- |
| Auth0 | Who signed in, and whether the OIDC tokens are authentic | Workspace membership, application permissions, or paid access |
| D1 application data | Which workspace the user belongs to, their role, permission overrides, and current entitlement | A successful payment or a verified external identity |
| Stripe | The workspace customer, subscription, Price, and payment lifecycle | A user session, workspace membership, or direct dashboard access |

A protected product request must pass each applicable gate:

1. **Authentication:** validate the Auth0 login and decrypt the server session.
2. **Tenant membership:** re-read the active `(workspaceId, userId)` membership
   from D1.
3. **Authorization:** calculate effective permissions from the current local
   role plus per-member overrides.
4. **Entitlement:** require the workspace's `platform_access` state when the
   requested feature is subscription-gated.
5. **Resource scope:** query tenant-owned data using the authenticated
   `workspaceId`, never a browser-supplied workspace as proof of access.

Passing one gate never bypasses another. For example, a valid Auth0 session
does not make someone a workspace member, `billing:manage` does not activate a
subscription, and a successful Stripe Checkout does not authorize the person
who returns to the application.

### Auth0: identity and session security

OpenChair uses Auth0 as an OIDC provider through the authorization-code flow
with PKCE. Login transactions are protected with `state` and `nonce`; returned
JWTs must use RS256 and are verified against the tenant's JWKS. Issuer,
audience/authorized-party, expiry, not-before, nonce, and access-token hash
claims are validated before a local session is created.

The application maps Auth0's stable `iss + sub` pair to an internal `userId`.
Email is profile data, not an authorization key. The resulting session is
AES-GCM encrypted and authenticated in an `__Host-` cookie with `HttpOnly`,
`Secure`, and `SameSite=Lax`. The session remembers the selected workspace for
navigation, but every protected request still rechecks active membership in
D1. This makes a suspension or permission denial effective on the next request
instead of waiting for the Auth0 session to expire.

Auth0 Organization and token role/permission claims are verified assertions.
They can help seed an initial local organization membership and are exposed
separately by `GET /api/v1/me`, but they never replace the authoritative D1
membership and permission checks. The platform-operator grant is also persisted
separately and rechecked in D1; it is not a normal workspace role.

### Granular workspace access

Roles provide a safe baseline:

| Role | Effective baseline |
| --- | --- |
| Owner | Manage workspace, members, billing, funds, and product access |
| Administrator | Same permission set as owner, but cannot manage an owner |
| Billing administrator | View the workspace, manage billing, and use the product |
| Member | View the workspace and use the product |

The canonical permissions are:

| Permission | Protects |
| --- | --- |
| `workspace:view` | Reading workspace-scoped screens and records |
| `workspace:manage` | Workspace configuration |
| `members:manage` | Membership, role, suspension, and permission changes |
| `billing:manage` | Checkout and Customer Portal creation |
| `funds:view` | Financial record visibility |
| `funds:manage` | Funding and ledger mutations |
| `product:use` | Core OpenChair product workflows |

Administrators can apply per-member `allow` or `deny` overrides. Only the
difference from the member's role is stored, and the backend recalculates the
effective set on every protected request. Owner protections remain separate:
an administrator cannot change an owner's access, users cannot suspend
themselves, active members must retain `workspace:view`, and a team cannot lose
its final active owner or administrator. Membership, role, suspension, and
granular-permission changes are written to the audit log.

Personal beneficiary workspaces remain single-user and do not expose nested
roles. Team service-provider and nonprofit workspaces can collaborate, but all
queries, events, jobs, cache keys, realtime channels, and storage objects must
retain `workspaceId` so data cannot cross tenant boundaries.

### Stripe: three isolated money paths

OpenChair does not treat every Stripe payment as the same kind of money:

| Stripe path | Purpose | Result inside OpenChair |
| --- | --- | --- |
| SaaS subscription billing | Charges a workspace for using the software | Updates only the workspace's `platform_access` entitlement |
| Program-fund deposits | Lets a verified benefactor contribute to a workspace funding pool | Posts a balanced, immutable program-ledger transaction |
| Appointment funding | Collects the sponsor and patient shares for one chair | Updates only that appointment's payment and workflow facts |

Each path has its own configuration, signing secret, webhook endpoint,
idempotency scope, provider-event records, and domain checks. A subscription
event cannot post money to a funding pool, a program deposit cannot mark an
appointment paid, and an appointment Checkout cannot activate SaaS access.
Stripe Connect payouts are not implemented, so none of these events proves
that a clinic received a payout.

SaaS Checkout and the Customer Portal require `billing:manage`. Program-fund
deposits require an active workspace membership plus a verified benefactor
relationship. Appointment funding requires an active membership plus the
applicable clinic, nonprofit, sponsor, patient, or administrator relationship
and the correct workflow stage. These checks run before the application
touches Stripe configuration, so an unauthorized caller receives a permission
denial rather than provider information.

All Stripe operations keep provider credentials server-side. Catalog Price IDs
come only from server configuration; the browser cannot submit an arbitrary
Price ID. Dynamic monthly SaaS pricing is validated server-side, limited to
nonprofit workspaces, and requires an idempotency key. Customers, Checkout
Sessions, subscriptions, deposits, and appointment payments carry scoped
internal references, while local records keep provider IDs separate from
application IDs.

A Checkout success URL is always informational. It never enables the product,
posts a deposit, or marks an appointment paid. Authoritative payment and
subscription changes use the corresponding webhook pipeline:

1. read the unmodified request body;
2. verify the `Stripe-Signature` HMAC and timestamp tolerance;
3. reject test/live-mode mismatches;
4. atomically claim the Stripe event so duplicate delivery is idempotent;
5. correlate the provider object to exactly one workspace-scoped local record;
6. validate the path-specific customer, metadata, amount, currency, Price,
   payment state, and workflow invariants;
7. project the verified fact into only the owning billing, ledger, or
   appointment domain.

For SaaS access, `active` and `trialing` subscriptions grant access. `past_due`
grants only the configured, time-limited grace state; incomplete, unpaid,
canceled, paused, or unrecognized pricing fails closed to inactive. Older
webhook deliveries cannot overwrite a newer subscription projection. Program
and appointment payments use their own append-only records and never rewrite
completed financial history.

Keep Auth0 client secrets, the session secret, Stripe API keys, and webhook
signing secrets out of source control. Local development uses the ignored
`.env.local`; each deployed environment should use separate credentials for
each environment and money path in its selected host's secret store.
Production hardening should migrate broad Stripe secret keys to minimally
permissioned restricted keys wherever the required API operations support
them.

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
