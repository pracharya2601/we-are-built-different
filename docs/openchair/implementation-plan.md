# OpenChair implementation plan

## Scaffold checkpoint

- Canonical contracts and events
- Pure workflow state machine
- Module repository/provider interfaces
- D1 schema for core product records
- Synthetic fixture catalog
- Fixture-backed protected workflow preview
- Projection API contract
- Happy-path and failure tests

## Done: persistence and commands

- [x] Appointment repository (`appointments/d1-repository.ts`) creating the
  appointment and its `OPEN_SLOT` workflow in one batch.
- [x] Pure commit planner (`workflow/commit-plan.ts`) and the single write path
  (`workflow/repository.ts`) committing state, history, and one outbox event
  per effect together.
- [x] Command receipts for idempotency and replay
  (`shared/command-receipts.ts`).
- [x] Publish, cancel, expire, and complete handlers (`workflow/commands.ts`).
- [x] Funding moved onto the shared commit path, which also fixed workflow
  effects being dropped instead of published on the webhook path.
- [ ] Mutation routes under `app/api/v1/openchair`.

Concurrency rests on two guards: the UPDATE matches only the version the
decision was made against, and the `(appointment_id, workflow_version)` unique
index rejects a second row for the same version, aborting the batch.

## Next: patient selection

- Implement encrypted beneficiary contact storage.
- Add nonprofit list and edit screens.
- Enforce consent and verification in candidate selection.
- Preserve candidate order and prevent edits after outreach begins.

## Done: appointment funding

- [x] Stripe event dispatcher separate from subscription projection
  (`app/api/webhooks/stripe/appointment-funding`).
- [x] Sponsor and patient Checkout through the provider port
  (`createAppointmentCheckout`).
- [x] Payments confirmed only through verified webhooks
  (`lib/openchair/funding/webhook.ts`).
- [x] Refunds requested through the port and finalized by the verified
  `charge.refunded` event (`requestAppointmentRefund`).

Funding now commits workflow facts through the shared workflow repository
rather than its own inline `applyWorkflowFact` plus `db.batch`.

## Outreach integration bridge

- [x] Map an approved candidate to one encrypted generic call job.
- [x] Send only one candidate at a time.
- [x] Translate generic Vapi outcomes into OpenChair outreach facts.
- [x] Wait for Workflow reservation before stopping remaining candidates.
- [x] Add dead-letter and operator-recovery orchestration.
- [ ] Compose the bridge with the live D1 workflow repository. The blocking
  checkpoint is now complete, and `workflow.outreach_requested` reaches the
  outbox, so this is the next unblocked step.

## Next: live product page

- Replace fixture projection with a D1-backed projection.
- Derive data and action grants from the authenticated membership, effective
  overrides, and appointment relationships.
- Add role-safe contextual panels and command forms.
- Add server-sent events or a Durable Object connection.
- Never use role query parameters or hidden buttons as authorization.

## Integration checkpoint

The deterministic test and demo sequence is:

```text
clinic publishes
→ nonprofit orders Maria, Ahmed, James
→ sponsor pays $60
→ Maria does not answer
→ Ahmed accepts
→ Workflow reserves Ahmed
→ James is never called
→ patient pays $20
→ CHAIR_FILLED
```

## Deferred

- Separate Workers and D1 databases
- Workspace switching and tenant administration
- Stripe Connect provider payouts
- Automated patient ranking
- Clinical diagnosis or triage
- Production deployment
