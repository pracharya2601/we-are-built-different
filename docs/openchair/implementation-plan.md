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

## Next: persistence and commands

- Implement appointment and workflow repositories.
- Commit workflow state, history, and outbox effects atomically.
- Add command receipt handling for idempotency and version conflicts.
- Implement create, publish, cancel, expire, and complete handlers.

## Next: patient selection

- Implement encrypted beneficiary contact storage.
- Add nonprofit list and edit screens.
- Enforce consent and verification in candidate selection.
- Preserve candidate order and prevent edits after outreach begins.

## Next: appointment funding

- Add a Stripe event dispatcher separate from subscription projection.
- Create sponsor Checkout and patient Checkout through the provider port.
- Confirm both payments only through verified webhooks.
- Add refund and balanced appointment-ledger behavior.

## Outreach integration bridge

- [x] Map an approved candidate to one encrypted generic call job.
- [x] Send only one candidate at a time.
- [x] Translate generic Vapi outcomes into OpenChair outreach facts.
- [x] Wait for Workflow reservation before stopping remaining candidates.
- [x] Add dead-letter and operator-recovery orchestration.
- [ ] Compose the bridge with the live D1 workflow command repository once the
  persistence-and-commands checkpoint above is complete.

## Next: live product page

- Replace fixture projection with a D1-backed projection.
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
