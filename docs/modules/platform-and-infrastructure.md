# Platform, data, and infrastructure module

## Status

The Worker, local/staging D1 separation, Drizzle migrations, provider inbox,
outbox utilities, scheduled image metadata delivery, private R2 uploads, and
local queued call binding are present. Production infrastructure is
intentionally unconfigured.

## Owns

- `worker/index.ts` fetch, schedule, and queue entry points.
- `wrangler.jsonc` environment-specific bindings and non-secret variables.
- `db/schema.ts`, `drizzle/`, and D1 access.
- `lib/events` provider inbox and durable outbox behavior.
- `lib/uploads` private R2 image storage and metadata delivery.
- environment examples and operational runbooks.

It does not own product workflow policy, provider business rules, or UI roles.

## Environment boundaries

Local, staging, and production must use different D1 databases, R2 buckets,
queues, provider tenants/credentials, and encryption keys.

- Local uses Wrangler's project-local simulation.
- Staging resources are explicitly named in `wrangler.jsonc`.
- Production remains absent until a non-OpenAI host and resources are reviewed.

Declaring a binding in source does not create the remote resource. Do not
provision queues/buckets, apply remote migrations, upload secrets, or deploy
unless the external change is explicitly approved.

## Schema workflow

```bash
npm run db:generate
npm run db:migrate:local
npm run typecheck
npm test
npm run build
```

Review generated SQL before applying it. Never edit an applied migration.
Every environment consumes the same ordered migration directory. Back up
remote D1 before destructive changes.

Tenant-owned tables require `workspace_id` and an appropriate workspace index.
Provider IDs should be unique only at their provider boundary. Posted ledgers,
workflow history, command receipts, and provider inbox records are durable
history, not mutable convenience rows.

## Background processing

- Provider webhooks verify authentication/signatures, claim the inbox event,
  apply state, then complete the claim.
- Outbox publishers lease bounded batches and mark success or retry failure.
- Queue consumers atomically claim a local job before external work.
- Scheduled recovery re-enqueues due call attempts and releases/delivers
  pending events.
- Dead-letter or repeated failures require an operator-visible recovery path.

Background work must carry `workspaceId`, correlation ID, and idempotency
identity. Queue delivery itself is not proof that external work completed.

## Logging and security

Log internal IDs, event types, status codes, correlation IDs, and request IDs.
Do not log access tokens, webhook secrets, full provider payloads, phone
numbers, beneficiary contact packets, transcripts, recordings, or card/bank
data.

Keep R2 private. Store secrets in `.env.local` locally and the reviewed
environment secret manager remotely. `.env.example` contains names and safe
placeholders only.

## Contributor verification

For binding, schema, queue, event, or storage changes, run `npm run
db:migrate:local` first, then the full suite in
[required checks](../../CONTRIBUTING.md#required-checks).

Document new bindings, resource names, secret ownership, retry behavior,
idempotency rules, and staging prerequisites in the same pull request.
