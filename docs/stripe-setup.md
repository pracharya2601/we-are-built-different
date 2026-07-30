# Stripe sandbox setup

Set up Stripe in a sandbox first. Do not copy live keys, prices, customers, or
webhook secrets into the local environment.

## Catalog contract

Create two service products with one flat-rate, licensed, monthly price each:

| Product | Amount | Description | Environment variable |
| --- | ---: | --- | --- |
| Being Different Lite | $10 USD/month | Essential workflows and standard service limits | `STRIPE_PRICE_PLATFORM_LITE` |
| Being Different Pro | $20 USD/month | Advanced workflows and expanded service limits | `STRIPE_PRICE_PLATFORM_PRO` |

The two Price IDs must be distinct and start with `price_`. Prices are
allowlisted on the server; the browser submits only `platform-lite` or
`platform-pro`.

Account policy further constrains the catalog:

- service providers can check out only the $20 monthly Pro plan and must have
  an active entitlement before entering the dashboard;
- beneficiaries can choose Lite or Pro through the normal billing workflow;
- nonprofits can choose Lite or Pro and are the only account type allowed to
  use custom contribution pricing.

## Create the sandbox resources

1. Open the Stripe Dashboard in sandbox/test mode.
2. Create both products and their recurring prices from the catalog contract.
3. Copy the two Price IDs. Do not copy the Product ID into either price
   variable.
4. Activate the sandbox customer portal.
5. Enable payment-method updates, invoice history, cancellation, and plan
   switching between the two catalog prices.
6. Keep cancellation at the end of the billing period unless product policy
   explicitly requires immediate cancellation.

Stripe prices cannot change their amount or billing interval after creation.
Create a replacement price and update the allowlisted environment value when
pricing changes.

## Configure localhost

Install and authenticate the Stripe CLI, then copy the environment template:

```bash
brew install stripe/stripe-cli/stripe
stripe login
cp .env.example .env.local
```

Set these values in the ignored `.env.local` file:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PLATFORM_LITE=price_...
STRIPE_PRICE_PLATFORM_PRO=price_...
STRIPE_PRODUCT_PLATFORM_LITE=prod_...
STRIPE_PRODUCT_PLATFORM_PRO=prod_...
```

Start the application in one terminal:

```bash
npm run db:migrate:local
npm run dev
```

Start the webhook forwarder in another terminal:

```bash
npm run stripe:listen
```

Copy the `whsec_...` signing secret printed by the listener into
`STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart the application. The CLI
secret is local to that listener configuration; it is not the production
webhook endpoint secret.

## Verify the flow

1. Sign in as a beneficiary or nonprofit workspace owner, admin, or billing
   admin to verify both catalog plans.
2. Open `/dashboard/billing`.
3. Confirm the page reports `Stripe connected`.
4. Start Lite Checkout and pay with Stripe's sandbox card
   `4242 4242 4242 4242`, any future expiration date, and any CVC.
5. Confirm Checkout returns to the informational return page.
6. Confirm the listener forwards a signed subscription event successfully.
7. Confirm D1 contains one Stripe customer mapping, one subscription
   projection, and an active `platform_access` entitlement.
8. Open the customer portal, switch to Pro, and confirm the
   webhook updates the stored Price ID without creating a second customer.
9. Schedule cancellation and confirm access follows the projected subscription
   status and configured grace policy.
10. Sign in through the service-provider path, confirm Lite is rejected, and
    confirm the dashboard remains gated until the Pro webhook activates access.

Never grant access from the Checkout return URL. Access changes only after
signature verification and idempotent webhook processing.

## Dynamic pricing contract

The versioned `POST /api/v1/billing/checkout` route supports server-generated
monthly prices for future core-product workflows. Amounts are integer cents and
products are mapped through the server-side allowlist:

```json
{
  "type": "dynamic-monthly",
  "productKey": "platform-pro",
  "unitAmount": 5000,
  "currency": "usd"
}
```

Send an `Idempotency-Key` header containing 8–128 safe characters. The example
creates a $50/month Pro Checkout Session. The route rejects unknown products,
non-integer amounts, non-USD currencies, and values outside 50 cents to
$100,000. The future core product should call this route from its backend using
Auth0 machine-to-machine authorization; the current scaffold requires an
authenticated billing manager session.

Stripe creates inline prices from `price_data`; they cannot be reused or
updated. The stable internal `pricingKey` is stored with the subscription and
included in entitlement change events, so the core product does not depend on
ephemeral Stripe Price IDs.

## Production handoff

Production setup remains blocked until a public host and canonical HTTPS origin
are selected. After that decision:

1. Create or copy the product and both prices into live mode.
2. Register `https://<canonical-host>/api/webhooks/stripe` in Stripe Workbench.
3. Subscribe only to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
4. Store the live `sk_live_...` key and endpoint-specific `whsec_...` value in
   the hosting secret manager.
5. Store live Price IDs as reviewed environment configuration.
6. Apply D1 migrations, deploy, and verify the registered endpoint with Stripe
   before enabling customer traffic.

Keep sandbox and live resources isolated. Never reuse a sandbox webhook secret
or Price ID in production.
