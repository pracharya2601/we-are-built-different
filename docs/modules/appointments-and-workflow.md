# Appointments and workflow module

## Status

The provider-neutral contracts, D1 schema, pure workflow state machine,
fixtures, and tests exist. Live appointment repositories, command handlers,
history/outbox persistence, and mutation routes are the next implementation
work.

## Owns

Appointments own clinic, time, duration, treatment label, price split, cutoff,
status, and record version. Workflow owns the authoritative stage, sponsor and
patient payment facts, one reserved candidate, terminal reason, history, and
workflow version.

Neither module calls Stripe or Vapi directly.

## Code and data map

- `lib/openchair/contracts`: commands, events, stages, actions, identifiers,
  and projection types.
- `lib/openchair/appointments`: appointment types and repository port.
- `lib/openchair/workflow`: pure state machine and workflow types.
- `db/schema.ts`: `openchair_appointments`, `openchair_workflows`,
  `openchair_workflow_history`, `openchair_command_receipts`.
- `docs/openchair/workflow-contract.md`: canonical transition policy.
- `tests/openchair-workflow.test.mjs`: deterministic transition tests.

## Inbound facts

The workflow advances only through facts such as:

- `appointment.published`;
- `candidates.approved`;
- `funding.sponsor_paid`;
- `outreach.patient_accepted`;
- `funding.patient_checkout_created`;
- `funding.patient_paid`;
- cancellation, expiration, exhaustion, completion, or failure.

A provider callback must first be verified and translated by its owning module.
The browser never posts an official workflow stage.

## Reliability contract

- Commands carry `idempotencyKey`, `expectedWorkflowVersion`, and
  `correlationId`.
- Stale versions fail with a conflict.
- Exact duplicate facts do not advance the workflow.
- A different second candidate cannot replace the reserved candidate.
- State, history, and outgoing effects must commit atomically.
- Every record and event carries `workspaceId`.
- `CHAIR_FILLED` requires verified sponsor payment, verified patient payment,
  and one workflow reservation.

## Next implementation slice

1. Implement workspace-scoped appointment and workflow repositories.
2. Claim a command receipt by idempotency key and request hash.
3. Load the workflow by both `workspaceId` and appointment ID.
4. check the expected version and apply the pure state machine;
5. commit workflow, history, command receipt, and outbox effects together;
6. add create, publish, cancel, expire, and complete API handlers;
7. add concurrency, duplicate-command, and cross-workspace tests.

Verify:

```bash
node --test tests/openchair-workflow.test.mjs
npm run typecheck
npm run build
```
