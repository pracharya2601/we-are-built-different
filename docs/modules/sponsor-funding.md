# Sponsor funding module

The sponsor is the party that pays the subsidised share of one appointment.
This guide follows that single role across the modules it touches.
[Funding and payments](funding-and-payments.md) describes the funding module as
a whole, including the patient half and the two unrelated money concepts.

## Status

The sponsor contribution is live end to end: approve, Checkout, verified
provider event, workflow advance, and refund request. Sponsorship is now a
durable D1 relationship, and the funding routes authorize against it.

Not implemented: any sponsor-facing page, a live caller for the frontend access
policy, and clinic payout. `authorizeWorkflowFrontend()` is still exercised only
by `tests/openchair-workflow.test.mjs`, so the projection layer does not yet
read the sponsor relationship that the routes enforce.

## Owns

- The sponsor share of one funding request, as `sponsorAmount`.
- The sponsor `openchair_payments` row, its Checkout attempts, and its refund
  state.
- The `funding.sponsor_paid` fact that releases outreach.

It does not own the patient contribution, the appointment price, workspace
membership, or clinic payout. A paid sponsor contribution is not proof the
clinic was paid; no payout mechanism exists.

## Code and data map

- `lib/openchair/funding/service.ts` — `approveAppointmentFunding()`,
  `createAppointmentCheckout()`, `requestAppointmentRefund()`,
  `expireAppointmentPayments()`
- `lib/openchair/funding/webhook.ts` — verified provider event to funding fact
- `lib/openchair/funding/stripe-provider.ts`, `payment-provider.ts` — the
  `AppointmentPaymentProvider` port and its Stripe adapter
- `lib/openchair/funding/config.ts`, `errors.ts`
- `lib/openchair/sponsors/access.ts` — pure `decideSponsorAccess()`
- `lib/openchair/sponsors/repository.ts` — workspace-scoped D1 reads, grant,
  and revoke
- `lib/openchair/sponsors/index.ts` — `requireAppointmentSponsor()` route guard
- `lib/runtime/appointment-funding.ts` — runtime db + provider wiring
- `app/api/v1/openchair/appointments/[appointmentId]/funding/approve`
- `app/api/v1/openchair/appointments/[appointmentId]/funding/[payerType]/checkout`
- `app/api/v1/openchair/appointments/[appointmentId]/funding/[payerType]/refund`
- `app/api/webhooks/stripe/appointment-funding`
- `lib/openchair/contracts/permissions.ts` — `funding.read`, `funding.approve`,
  `funding.pay`, and the `sponsor` viewer role
- `lib/openchair/authorization/frontend-access.ts`,
  `lib/openchair/projections/access-policy.ts`
- `openchair_appointment_sponsors`, `openchair_funding_requests`,
  `openchair_payments`, `openchair_payment_attempts`,
  `openchair_funding_ledger_entries` in `db/schema.ts`
- `tests/openchair-sponsors.test.mjs`, `tests/appointment-funding.test.mjs`,
  `tests/openchair-workflow.test.mjs`

## Sponsor sequence

1. **Approve.** `POST .../funding/approve` requires the workflow at
   `FUNDING_APPROVAL`. It writes one funding request, a `PENDING` payment row
   per non-zero payer amount, and a `funding.approved` outbox event in one
   batch. Calling it again returns the existing request rather than creating a
   second one.
2. **Checkout.** `POST .../funding/sponsor/checkout` re-checks the stage, calls
   the provider, upserts an attempt row keyed by
   (`workspaceId`, `idempotencyKey`), and moves the payment to
   `CHECKOUT_CREATED`. The response carries the Checkout URL.
3. **Verified payment.** `checkout.session.completed` or
   `checkout.session.async_payment_succeeded` is signature-verified and claimed
   through the provider inbox, then becomes the `funding.sponsor_paid` fact.
   The payment becomes `PAID`, a `PAYMENT_RECEIVED` ledger entry is appended,
   the funding request moves to `SPONSOR_PAID`, and the workflow advances
   `FUNDING_APPROVAL` to `CALLING_PATIENTS` with a `workflow.outreach_requested`
   effect. Paying the sponsor share is what starts patient outreach.
4. **Refund.** `POST .../funding/sponsor/refund` returns `202` with the
   provider refund ID. It only requests the refund; the verified
   `charge.refunded` event finalizes payment state and appends the
   `REFUND_ISSUED` entry.

The patient share follows later and separately: patient Checkout requires
stage `PATIENT_ACCEPTED` **and** `sponsorPaid` already true.

### Amounts and expiry

The split must balance — `sponsorAmount + patientAmount === discountedPrice`,
all safe non-negative integers in minor units — or approval fails `409
invalid_funding_split`. A zero sponsor amount creates no sponsor payment row,
so Checkout then returns `404 payment_not_found`.

Payments carry the appointment's `expiresAt`. Checkout against an expired
payment marks it `EXPIRED` and returns `410 funding_expired`.
`expireAppointmentPayments()` sweeps `PENDING`, `CHECKOUT_CREATED`, and
`FAILED` rows past their expiry.

### Idempotency

- Checkout accepts an optional `Idempotency-Key` header matching
  `^[A-Za-z0-9_:.+-]{8,128}$`; the route namespaces it by workspace,
  appointment, and payer type. A missing or malformed key becomes a random
  UUID, so a retried Checkout without a key creates a new attempt.
- Refund **requires** the header and returns `400 missing_idempotency_key`
  without it.
- A repeated `funding.sponsor_paid` fact leaves the workflow unchanged rather
  than advancing twice.

## Authorization

Two independent things must both hold before a funding route executes.

1. **Membership.** All three routes wrap in
   `withApiAuth(handler, "product:use")`, which every workspace role holds. This
   proves an active membership in the workspace and nothing more.
2. **Relationship.** Each handler then calls
   `requireAppointmentSponsor(db, auth, appointmentId)`, which grants access by
   exactly two paths and denies everything else with `403`:
   - `funds:manage` — the owner/administrator override, unchanged from before
     appointment sponsorship existed;
   - `product:use` plus an `ACTIVE` `openchair_appointment_sponsors` row for
     this workspace, this appointment, and this user.

`decideSponsorAccess()` in `sponsors/access.ts` is pure, so each branch is
tested directly. A record from another workspace or another appointment is an
explicit denial (`workspace_mismatch`, `appointment_mismatch`) rather than a
fallthrough, and the repository query is workspace-scoped so such a row is
never loaded to begin with. Revocation takes effect on the next request.

Authorization runs before `getAppointmentFundingRuntime()`, so an unauthorized
caller receives `403` rather than a Stripe configuration error when the
provider is unconfigured.

A sponsor who is not a workspace admin can now approve and pay. What still does
not exist is a way for the projection layer to know that.

**The `sponsor` viewer role is presentation only.** In
`frontend-access.ts`, `relationshipAllowsAction()` gates every `funding.*`
action on `relationships.sponsor`, and the sponsor relationship plus
`funding.read` grants exactly two data grants:

| Grant | Sponsor |
| --- | --- |
| `funding.summary` | granted |
| `payment.status` | granted |
| `beneficiary.list`, `candidate.*` | never — nonprofit only |
| `outreach.status`, `outreach.transcript` | never — operator only |
| `accepted-patient.identity`, `accepted-patient.contact` | never — operator at `PATIENT_ACCEPTED`, clinic at `CHAIR_FILLED` |

That layer decides what a screen may render. It has never authorized an
operation, and `?role=sponsor` on the fixture preview changes presentation
only.

## Frontend contract

Everything below is what a client needs to drive the sponsor flow. See
[Granular frontend access](../openchair/frontend-access.md) for the projection
and grant model that decides what a screen may render.

### Endpoints

All three are `POST`, all respond `cache-control: no-store`, and all require a
signed-in session whose workspace matches the appointment.

| Endpoint | Success | Body |
| --- | --- | --- |
| `/api/v1/openchair/appointments/:id/funding/approve` | `201` | `{ fundingRequest }` |
| `/api/v1/openchair/appointments/:id/funding/sponsor/checkout` | `201` | `{ paymentId, payerType, checkoutSessionId, url }` |
| `/api/v1/openchair/appointments/:id/funding/sponsor/refund` | `202` | `{ requested: true, paymentId, refundId }` |

`fundingRequest` carries `id`, `appointmentId`, `currency`, `totalAmount`,
`sponsorAmount`, `patientAmount`, `status`, `expiresAt`, and `version`. Amounts
are integer minor units — `2500` is USD 25.00 — so format with the `currency`
field and never divide a total client-side to derive a share.

Approve is safe to repeat: a second call returns the existing funding request
with `201` rather than creating a second one.

Redirect the browser to the `url` from the Checkout response. Do not construct
a Stripe URL, and do not reuse a `url` from an earlier response.

### Idempotency

Both mutating calls accept an `Idempotency-Key` header matching
`^[A-Za-z0-9_:.+-]{8,128}$`. The server namespaces it per workspace,
appointment, and payer, so a client key only needs to be unique per user
intent.

- **Checkout** — optional. Omitting it means a retry creates a *new* Checkout
  attempt, so send a key that is stable for one user's click and regenerated
  when they deliberately start over.
- **Refund** — required. A missing or malformed key is rejected `400`.

### Errors

Every failure uses one envelope:

```json
{ "error": { "code": "not_a_sponsor", "message": "You do not sponsor this appointment." } }
```

Branch on `code`, never on `message` — messages are wording and will change.

| Status | Code | What the UI should do |
| --- | --- | --- |
| `401` | `authentication_required` | Send the user through sign-in, then retry. |
| `403` | `not_a_sponsor`, `workspace_mismatch`, `appointment_mismatch` | Hide the sponsor controls; this user cannot fund this appointment. |
| `403` | `sponsorship_revoked` | Same, with a distinct message — access was withdrawn. |
| `403` | `missing_product_use`, `permission_denied` | Membership problem, not a sponsorship problem. Point at workspace administration. |
| `400` | `missing_idempotency_key` | Client bug — refund requires the header. |
| `404` | `appointment_not_found` | Stale link. Return to the appointment list. |
| `404` | `payment_not_found` | No sponsor share is owed; render the zero-sponsor case rather than an error. |
| `404` | `invalid_payer_type` | Client bug — the path segment must be `sponsor` or `patient`. |
| `409` | `funding_not_ready` | Workflow is not at `FUNDING_APPROVAL`. Refetch and re-render the stage. |
| `409` | `invalid_funding_split` | Data problem on the appointment; escalate rather than retry. |
| `409` | `payment_already_final` | Already paid or refunded. Refetch; do not offer to pay again. |
| `409` | `payment_not_ready` | Wrong stage for this payer. Refetch. |
| `409` | `payment_not_refundable` | Only a verified paid contribution can be refunded. Refetch. |
| `410` | `funding_expired` | The window closed. Offer nothing but a return path. |
| `500` | `funding_internal_error` | Retry is safe with the same idempotency key. |

A `409` or `410` almost always means the client is rendering stale state.
Refetch the appointment before showing the user an error.

### What the client must never infer

- **The Checkout return proves nothing.** The server redirects to
  `/appointments/:id?checkout=returned` or `?checkout=canceled`. These are
  navigation hints only. Payment becomes real when a signature-verified Stripe
  webhook is processed, which may land before *or* after the browser returns.
  On return, refetch and render the server's payment status; if it is still
  pending, show a pending state rather than success.
- **`202` from refund is a request, not a refund.** The verified
  `charge.refunded` event finalizes it. Poll or refetch.
- **A rendered control is not authorization.** Every endpoint independently
  re-checks permission, relationship, stage, and expiry. Treat a `403` on a
  visible button as a normal outcome, not an impossible one.

### Known gap

The projection does not yet expose whether the signed-in user sponsors an
appointment — `AppointmentRelationships.sponsor` has no production source, and
`authorizeWorkflowFrontend()` still has no live caller. Until item 2 of the next
slice lands, a client cannot ask "should I show sponsor controls?" and must
either be told out of band or call the endpoint and handle `403 not_a_sponsor`
as the answer. Do not fill this gap with an account-type label or a query
parameter.

## Configuration

`loadAppointmentFundingConfig()` requires `STRIPE_APPOINTMENT_SECRET_KEY`
(`sk_test_` or `sk_live_`) and `STRIPE_APPOINTMENT_WEBHOOK_SECRET` (`whsec_`),
and throws when either is missing or malformed, so the feature fails closed
when unconfigured. `STRIPE_APPOINTMENT_WEBHOOK_TOLERANCE_SECONDS` defaults to
300. These are separate from the SaaS subscription keys. Forward events locally
with `npm run stripe:listen:appointments`.

## Rules for changes

- A browser return from Checkout never marks a contribution paid. Only a
  verified provider event does.
- Scope every read and write by `workspaceId`; a client-supplied workspace ID
  is not evidence.
- Refunds and corrections are new immutable events and ledger rows, never edits
  to paid history.
- Do not widen a sponsor's data grants to cover beneficiary, candidate, or
  outreach data.
- Do not claim the clinic was paid until a payout mechanism exists.

## Next implementation slice

1. Add sponsorship management endpoints. `grantAppointmentSponsorship()` and
   `revokeAppointmentSponsorship()` exist in the repository but no route or UI
   calls them, so rows must be created directly in D1 today.
2. Feed `AppointmentRelationships.sponsor` in
   `authorization/frontend-access.ts` from `findAppointmentSponsor()` rather
   than a caller-supplied boolean, so the projection and the routes agree on
   who the sponsor is.
3. Call `authorizeWorkflowFrontend()` from the real projection path instead of
   tests only, and strip denied fields before serialization.
4. Build the sponsor view on the D1-backed projection rather than fixtures.
5. Leave clinic payout out until a Connect payout worker consumes
   fully-funded and visit-completed facts; it must not reinterpret a Checkout
   receipt as a clinic payout.

Verify:

```bash
node --test tests/appointment-funding.test.mjs tests/openchair-workflow.test.mjs
npm run typecheck
```
