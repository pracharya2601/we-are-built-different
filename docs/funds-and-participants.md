# Funds and Participant Records

## Domain Roles

Participant roles describe a person’s relationship to a funding program. They
are separate from workspace authorization roles such as `owner` or `admin`, and
one person may hold more than one participant role.

| Role | Meaning | Required record |
| --- | --- | --- |
| `benefactor` | Contributes money | Deposit transaction and provider payment reference |
| `beneficiary` | Receives an allocation or funded service | Allocation and related provider payment |
| `service_provider` | Delivers a service and receives money | Connected account, transfer, and payout status |

Only active workspace members can receive participant roles. Participant roles
never grant administrative permissions.

## Funds Model

A `funding_pool` belongs to one workspace and one currency. Pool balances are
derived from immutable ledger entries; they are not editable counters.

Each posted transaction contains positive minor-unit amounts, such as `2500`
for USD 25.00, and balanced debit and credit entries:

| Business event | Debit | Credit |
| --- | --- | --- |
| Benefactor deposit | Pool cash | Available pool obligation |
| Beneficiary allocation | Available obligation | Beneficiary allocation |
| Service-provider payment | Beneficiary allocation or available obligation | Pool cash |

The transaction header records the benefactor, beneficiary, and service
provider as applicable. It also stores immutable provider object IDs and a
workspace-scoped idempotency key. Corrections must create a reversal or
adjustment; never edit or delete a posted record.

## Stripe Boundary

Existing Stripe subscriptions pay for access to this SaaS and remain separate
from program funds.

For real program funds, the intended integration is Stripe Connect:

1. Create and onboard a connected account for each service provider.
2. Create a PaymentIntent when a benefactor contributes.
3. Record a pending internal transaction, but do not post cash from the browser
   return URL.
4. After a verified `payment_intent.succeeded` webhook, post the benefactor
   deposit exactly once.
5. Allocate funds to a beneficiary through an authorized application action.
6. Create a Stripe Transfer to the enabled provider account.
7. After the verified transfer event, post the service-provider payment and
   store both the PaymentIntent and Transfer IDs.
8. Reconcile Stripe objects with the internal ledger daily.

Stripe documents separate charges and transfers for cases where the eventual
recipient is not known when payment is collected or one charge funds multiple
connected accounts. Stripe also notes that the platform bears fees, refunds,
chargebacks, and negative-balance responsibility for this flow. Review the
business model, supported regions, payout schedule, refund policy, and legal
requirements before enabling live money movement:

- [Stripe Connect overview](https://docs.stripe.com/connect)
- [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Connected-account onboarding](https://docs.stripe.com/connect/onboarding)
- [Connected-account payouts](https://docs.stripe.com/connect/payouts-connected-accounts)

Do not store card numbers or bank account details. Use Stripe-hosted or embedded
onboarding so Stripe collects provider identity and payout information.

## Application Interfaces

- `GET/POST /api/v1/finance/participants` lists or assigns domain roles.
- `GET/POST /api/v1/finance/pools` lists or creates currency-specific pools.
- `GET /api/v1/finance/transactions?poolId=...` returns posted records.
- `recordPostedMoneyFlow()` is the only posting service and always creates
  balanced entries in the same D1 batch.

The scaffold intentionally exposes no browser endpoint that marks money as
posted. Future write handlers must call the posting service only after verified
provider events or a separately approved, audited manual-adjustment workflow.

## Invariants

- Every record carries `workspaceId`; cross-workspace parties and pools are
  rejected.
- Amounts are positive safe integers and currencies are uppercase ISO codes.
- A participant must have the matching active domain role.
- Pool and transaction currencies must match.
- Debits equal credits for every posted transaction.
- Idempotency keys cannot be reused for different business actions.
- Provider payment and transfer IDs are unique.
- Only owners and administrators have `funds:view` and `funds:manage`.
- Subscription webhooks never create pool transactions.
