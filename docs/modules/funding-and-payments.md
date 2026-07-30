# Funding and payment modules

OpenChair has three different money concepts. Contributors must keep them
separate.

## 1. SaaS subscription billing

Status: live.

`lib/billing`, the Stripe billing APIs, and Stripe webhook projection charge a
workspace for access to the OpenChair software. The result is the
`platform_access` entitlement.

This entitlement never proves that a dental appointment or patient
contribution was funded.

## 2. Generic program-funds ledger

Status: foundational ledger and participant APIs live.

`lib/finance` owns participant roles, funding pools, immutable transaction
headers, and balanced ledger entries. Posted records cannot be edited. Browser
routes do not mark provider money as posted.

See `docs/funds-and-participants.md`.

## 3. OpenChair appointment funding

Status: MVP Checkout handlers and verified provider-event projection are live.

`lib/openchair/funding` owns:

- one funding request per appointment;
- sponsor and patient amounts;
- separate sponsor and patient payment records;
- Stripe Checkout/payment/refund references;
- payment expiration and refund state;
- the `AppointmentPaymentProvider` port.
- retryable Checkout attempts and an append-only appointment funding journal.

Tables are `openchair_funding_requests`, `openchair_payments`,
`openchair_payment_attempts`, and `openchair_funding_ledger_entries`.

## MVP HTTP flow

1. `POST /api/v1/openchair/appointments/:id/funding/approve`
2. `POST /api/v1/openchair/appointments/:id/funding/sponsor/checkout`
3. After the sponsor-paid webhook and patient reservation:
   `POST /api/v1/openchair/appointments/:id/funding/patient/checkout`
4. For a full refund:
   `POST /api/v1/openchair/appointments/:id/funding/:payer/refund`

Checkout and refund calls accept an `Idempotency-Key` header. A failed or
expired Checkout can be retried with a new key while the funding request is
still active. Browser returns never mark a payment paid.

Appointment funding uses `STRIPE_APPOINTMENT_SECRET_KEY` and
`STRIPE_APPOINTMENT_WEBHOOK_SECRET`, separate from SaaS subscription
configuration. Run `npm run stripe:listen:appointments` for local forwarding.

Stripe Connect is intentionally not part of this MVP. A future payout worker
should consume fully-funded/visit-completed facts, create transfers to clinic
connected accounts, and append payout ledger records; it must not reinterpret
Checkout receipts as clinic payouts.

## Provider boundary

Only the funding adapter calls Stripe for appointment payments. A verified
Stripe webhook is translated to a funding fact. Checkout return URLs and
client-visible Stripe objects never confirm payment.

The intended sequence is:

1. approve the funding split;
2. create sponsor Checkout with an idempotency key;
3. verify the sponsor payment webhook;
4. emit `funding.sponsor_paid`;
5. after workflow reservation, create patient Checkout;
6. verify the patient payment webhook;
7. emit `funding.patient_paid`;
8. post any approved ledger effects exactly once.

## Rules for changes

- Store amounts as positive integer minor units and use one uppercase
  three-letter currency.
- The split must balance: sponsor plus patient equals the discounted total.
- Provider IDs and idempotency keys are unique.
- Webhook event processing uses the provider inbox.
- State change and workflow/outbox effect commit together.
- Never put card or bank details in D1.
- Do not claim the clinic was paid until a payout mechanism is implemented.
- Refunds and corrections are new immutable events/records, not edits to paid
  history.

## Contributor workflow

Implement the appointment-funding provider adapter separately from SaaS
billing configuration. Add deterministic fake-provider tests for success,
duplicate events, invalid signatures, stale state, refunds, currency mismatch,
and cross-workspace denial.

Verify:

```bash
node --test tests/dynamic-billing.test.mjs tests/stripe-config.test.mjs tests/finance-ledger.test.mjs tests/openchair-workflow.test.mjs
npm run typecheck
```
