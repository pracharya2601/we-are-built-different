# OpenChair module contributor guide

This is the starting point for contributors who pull the repository and work
on one part of OpenChair. The product currently uses a modular monolith: the
modules share one vinext Cloudflare Worker and one D1 database, but their
contracts and provider ports are kept separate so they can be extracted later.

Two names appear throughout: **OpenChair** is the product, and **Built
Different** is the platform it runs on — the repository, the Worker
(`built-different-control-plane`), the D1 databases, and the session cookie all
carry the platform name. Docs that say "the application" or "the control plane"
mean the platform layer.

## Start here

Follow [first local checkout](../../CONTRIBUTING.md#first-local-checkout) to
install, migrate, and run. Use `npm ci`, not an unpinned dependency update.

The full authenticated UI requires local Auth0 configuration. Stripe and Vapi
are required only when exercising their provider-backed flows. Deterministic
tests must never contact Auth0, Stripe, Vapi, or remote Cloudflare resources.

## Two role systems

Do not mix these concepts:

1. Account and product roles describe the user's journey: service provider,
   nonprofit/sponsor, beneficiary, clinic, or platform operator.
2. Workspace roles authorize application actions: `owner`, `admin`,
   `billing_admin`, and `member`.

The signed-in workspace and effective D1 permissions authorize a request. A
product role, fixture query parameter, Auth0 email, or hidden button never
authorizes an operation. See [product roles](product-roles.md).

## Technical module map

| Module | Primary code | Current status | Guide |
| --- | --- | --- | --- |
| Identity and workspaces | `lib/auth`, `lib/data`, workspace APIs | Live | [Identity and workspaces](identity-and-workspaces.md) |
| Appointments and workflow | `lib/openchair/appointments`, `workflow`, `contracts` | Contracts, schema, state machine, D1 persistence, and idempotent commands live; mutation routes next | [Appointments and workflow](appointments-and-workflow.md) |
| Beneficiaries and candidates | `lib/openchair/beneficiaries` | Contracts, eligibility, schema; CRUD/selection next | [Beneficiaries and candidates](beneficiaries-and-candidates.md) |
| Funding and payments | `lib/openchair/funding`, `lib/finance`, `lib/billing` | SaaS billing, generic ledger, and appointment funding (approve, Checkout, refund, verified webhook) live | [Funding and payments](funding-and-payments.md) |
| Sponsor funding | `lib/openchair/funding` sponsor path, `contracts/permissions`, `authorization` | Approve, Checkout, verified payment, refund, and D1 sponsor authorization live; sponsorship management endpoints and sponsor UI next | [Sponsor funding](sponsor-funding.md) |
| Outreach and voice calls | `lib/openchair/outreach`, `lib/calls` | Generic queued Vapi calls and the OpenChair sequencing adapter live; D1-backed run/attempt store and routes next | [Outreach and calls](outreach-and-calls.md) |
| Projections and UI | `lib/openchair/projections`, fixtures, appointment page | Fixture-backed preview live; D1 projection and command UI next | [Projections and UI](projections-and-ui.md) |
| Platform and infrastructure | `worker`, `lib/events`, uploads, Wrangler, migrations | Local bindings and worker flows live; remote resources environment-specific | [Platform and infrastructure](platform-and-infrastructure.md) |

## Dependency direction

```text
app pages and API routes
        |
        v
application modules and projections
        |
        +--> lib/openchair/contracts
        +--> repositories and provider ports
        |
        v
D1 / inbox / outbox / queue bindings
        |
        v
Auth0, Stripe, Vapi, Cloudflare R2
```

`lib/openchair/contracts` must stay provider-neutral. OpenChair outreach adapts
to `lib/calls`; it does not create a second Vapi client. OpenChair appointment
funding uses its own provider port and records; it does not reuse SaaS
subscription entitlements as proof that care was funded.

## Shared invariants

Every module must preserve these rules:

- `workspaceId` is present in every tenant-owned record, repository query,
  event, queue correlation, cache key, and object key.
- Stable internal IDs are used across modules; Auth0, Stripe, and Vapi IDs stay
  at provider boundaries.
- Protected requests recheck active D1 membership and the required permission.
- Mutations use idempotency keys where a retry is possible.
- Workflow mutations use an expected version and return a conflict when stale.
- Provider webhooks are verified before state changes and deduplicated through
  the provider inbox.
- Browser redirects, queue delivery, fixture data, and client state never
  prove payment, identity, consent, call completion, or workflow advancement.
- Secrets remain outside Git. Sensitive recipient and beneficiary contact data
  is encrypted, and logs contain internal IDs rather than raw payloads.
- Schema changes use a newly generated migration shared by every environment.

## Choosing a workstream

Read the module guide before coding. It identifies owned files, dependencies,
unfinished work, tests, and the handoff contract. If a task crosses modules,
make the shared contract change explicit first and keep provider-specific
details behind the owning adapter.

For the end-to-end product sequence, also read:

- [OpenChair architecture](../openchair/architecture.md)
- [Workflow contract](../openchair/workflow-contract.md)
- [Implementation plan](../openchair/implementation-plan.md)
