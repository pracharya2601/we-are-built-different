# OpenChair scaffold architecture

## Decision

The first MVP is a modular monolith:

```text
vinext application and BFF
        |
        v
OpenChair application modules
        |
        +-- workflow
        +-- appointments
        +-- beneficiaries and candidates
        +-- funding
        +-- outreach adapter
        +-- role-safe projections
        |
        v
one Cloudflare D1 database
```

External provider calls stay behind ports:

```text
funding module  -> AppointmentPaymentProvider -> Stripe
outreach module -> VapiCallProvider           -> existing lib/calls
outreach module -> OutreachQueue              -> Cloudflare Queue
```

The browser never writes D1, confirms payment, reserves a patient, or changes a
workflow stage directly.

## Single-tenant scope

The MVP does not build workspace switching, cross-tenant administration, or
service-specific tenancy. The signed-in workspace is treated as the one active
organization.

`workspaceId` remains on every product record and repository call. This is a
storage safety invariant, not a multi-tenant feature commitment. It prevents
global record lookups and allows the product to grow without an unsafe data
migration. Client-supplied workspace IDs are never authorization evidence.

## Module ownership

### Workflow

Owns the authoritative stage, version, accepted candidate, terminal reason,
ordered history, and reactions to verified facts.

### Appointments

Owns clinic, start time, duration, treatment label, price split, cutoff, and
appointment lifecycle metadata.

### Beneficiaries

Owns minimum patient identity/contact material, consent, availability,
verification, candidate order, and candidate status.

### Funding

Owns funding requests, sponsor and patient payment records, Stripe Checkout
references, verified webhook outcomes, refunds, and appointment-payment ledger
entries. Existing SaaS subscription billing remains separate.

### Outreach

Owns appointment-specific sequencing and candidate/call mappings. Vapi owns the
call transport and conversation execution. Workflow—not Vapi—owns reservation.

### Projection

Builds the role-safe `WorkflowProjection` consumed by the shared appointment
page. Projection code may combine module APIs or read models; it cannot decide
official workflow state.

## Reliability rules

- Commands carry an idempotency key and expected workflow version.
- Provider events are claimed through the provider inbox.
- State changes and outgoing events are committed together using the outbox.
- Duplicate facts do not increment workflow version.
- A different second patient acceptance fails closed.
- Queue delivery never proves that a call occurred.
- Browser redirects never prove that a payment succeeded.
- Correlation IDs link the appointment, command, event, provider callback, and
  audit record.

## Extraction path

If independent deployment becomes necessary, extract one module at a time:

1. Keep `lib/openchair/contracts` stable.
2. Move the module and its tables to a Worker and D1 database.
3. Replace its local repository/service call with an authenticated client.
4. Preserve the same command, event, idempotency, and projection contracts.

No extraction is required to complete the first demo.
