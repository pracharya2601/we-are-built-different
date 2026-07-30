## Module

- Module guide:
- Product journey or actor:

## Change

- What changed:
- What remains intentionally out of scope:

## Contracts and boundaries

- [ ] Public types, commands, events, routes, and environment names are listed.
- [ ] Tenant-owned data and queries retain `workspaceId`.
- [ ] Backend authorization uses effective local permissions.
- [ ] Provider-specific code remains behind the owning adapter.
- [ ] Retryable work is idempotent and version/concurrency behavior is covered.
- [ ] No secrets, raw sensitive payloads, transcripts, or payment credentials are committed or logged.

## Data and operations

- Migration:
- Webhook/queue/outbox impact:
- Local/staging/production resource impact:
- Recovery or rollback notes:

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] UI screenshots attached when presentation changed.

## Handoff

- New dependency for another module:
- Known limitation:
- Recommended next task:
