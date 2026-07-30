# Data and Operations

## Persistence

Production uses Cloudflare D1 through Drizzle. Apply every file in `drizzle/`
in journal order; do not edit an applied migration. Generate changes with
`npm run db:generate`, review the SQL, then apply it through the deployment
pipeline. Enable foreign keys for local SQLite sessions.

Back up D1 before destructive migrations. Test restore procedures quarterly,
and retain audit and billing records according to the product's documented
retention policy. Application logs must contain internal IDs and request IDs,
never access tokens, webhook secrets, or full provider payloads.

## Provider Event Processing

Webhook handlers must verify provider signatures before persisting anything.
Call `claimProviderEvent` using the immutable provider event ID:

- `claimed: true` means this worker may apply the event.
- `claimed: false` means acknowledge the duplicate without applying it.
- Call `completeProviderEvent` only after all projections succeed.
- Call `failProviderEvent` on failure; a later delivery can reclaim it.

Run `failStaleProviderEvents` on a schedule to recover interrupted processing.
Choose a threshold longer than the maximum expected handler duration.

Entitlement projections use monotonically increasing `revision` values.
Consumers must deduplicate outbox `eventId` values and ignore revisions older
than their current projection. Poll with `claimOutboxBatch`, publish, then call
`markOutboxPublished`; retry failures with exponential backoff through
`markOutboxFailed`. Run `releaseExpiredOutboxLeases` every minute.

## Demo Data

`seedDemoData(db, APP_ENV)` is only for `demo` or `development`. It creates a
clearly labeled local user and workspace with `platform_access` set to
`inactive`. It never creates a Stripe customer, subscription, or paid access.
Do not invoke this function from a production startup path.

## Scheduled Reconciliation

At least daily, compare locally stored Stripe customer/subscription projections
with Stripe and repair drift through the same revisioned projection path.
Alert on:

- inbox events stuck in `processing`;
- repeated inbox or outbox failures;
- outbox publishing lag;
- active entitlements without an active, trialing, or grace subscription;
- workspaces with multiple Stripe customer mappings.

## Security and Recovery

Use separate D1 databases and provider tenants for development, staging, and
production. Restrict migration and reconciliation credentials to operators.
Audit membership, billing, entitlement, and configuration changes. For account
deletion, disable access immediately, then perform retention-aware erasure in a
background job; never rewrite historical migration files.
