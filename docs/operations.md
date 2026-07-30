# Data and Operations

## Persistence

The local runtime and staging environment use separate Cloudflare D1 databases
through the stable `DB` binding. Apply every file in `drizzle/` in journal
order; do not edit an applied migration. Generate changes with
`npm run db:generate`, review the SQL, test locally, then inspect and apply
staging migrations with:

```bash
npm run db:migrations:list:staging
npm run db:migrate:staging
```

The staging command targets `built-different-staging` explicitly and requires
the `staging` Wrangler environment. Enable foreign keys for local SQLite
sessions. Production requires a separate D1 database and must never reuse the
staging database ID.

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

## Scheduled Reconciliation

At least daily, compare locally stored Stripe customer/subscription projections
with Stripe and repair drift through the same revisioned projection path.
Alert on:

- inbox events stuck in `processing`;
- repeated inbox or outbox failures;
- outbox publishing lag;
- active entitlements without an active, trialing, or grace subscription;
- workspaces with multiple Stripe customer mappings.

## Image Upload Delivery

Image bytes are uploaded through an authenticated Worker route into the private
Cloudflare R2 `IMAGE_UPLOADS` binding. The control plane validates and stores
the object before completing its
workspace-scoped `image_uploads` record and enqueuing
`image.upload.completed.v1`.

The Worker's one-minute schedule delivers those events to the configured file
metadata service. The receiver must deduplicate the `Idempotency-Key` header.
Each run first releases expired outbox leases, then delivers a bounded batch
concurrently with ten-second request timeouts. Monitor pending/failed image
events, retry age, and the count of pending uploads.
Do not delete an object or upload record until its retention policy and
downstream acceptance state are known. Configuration and the full client/event
contract are in [`image-uploads.md`](image-uploads.md).

## Security and Recovery

Use separate D1 databases and provider tenants for development, staging, and
production. Restrict migration and reconciliation credentials to operators.
Audit membership, billing, entitlement, and configuration changes. For account
deletion, disable access immediately, then perform retention-aware erasure in a
background job; never rewrite historical migration files.

Local authentication bypass is intentionally triple-gated by
`APP_ENV=development`, `LOCAL_AUTH_BYPASS=true`, and the company authentication
feature flag being off. The local Wrangler vars enable it; staging vars do not.
Never add `LOCAL_AUTH_BYPASS=true` to staging or production.

Live authentication is tenant-scoped and fail-closed. A valid Auth0 session is
not sufficient: every protected request rechecks the active local membership
and workspace status. Suspensions and role changes therefore take effect
immediately. App-managed team members must first complete a verified Auth0
login. Auth0 Organization members are provisioned as local members and can
then be promoted by a workspace owner or administrator.
