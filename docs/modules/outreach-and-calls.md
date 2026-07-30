# Outreach and Vapi call modules

This area has two layers.

## Generic queued calls

Status: implemented and fail-closed until local Vapi configuration is present.

`lib/calls` owns:

- validating and encrypting an owner-created call job;
- the ID-only Cloudflare Queue message;
- Vapi `POST /call`;
- provider call ID correlation;
- authenticated, idempotent Vapi callbacks;
- structured generic outcomes and retry timing;
- owner-only call logs without transcripts or recordings;
- an operator-only live transcript that exists only while a call is connected.

The Worker queue consumer lives in `worker/index.ts`. The API and console live
under `app/api/v1/admin/calls` and `app/dashboard/admin/calls`.

Read `docs/call-automation.md` for the runtime flow and local configuration.

## OpenChair outreach

Status: types, queue/provider ports, D1 schema, and the sequencing adapter
(`service.ts`, `generic-call-adapter.ts`, `outcome.ts`) exist; the D1-backed run
and attempt store plus live command/event handlers are next.

`lib/openchair/outreach` owns:

- appointment-level outreach run state;
- ordered candidate sequencing;
- candidate-to-generic-call mappings;
- normalized OpenChair outcomes;
- stopping after Workflow reserves one candidate;
- exhaustion and operator-review behavior.

Tables are `openchair_outreach_runs` and
`openchair_outreach_attempts`.

OpenChair outreach must adapt to `lib/calls`. It must not duplicate Vapi
authentication, raw HTTP, encrypted call storage, or webhook processing.

## Mapping contract

A candidate can be sent to the generic call module only after eligibility,
consent, candidate approval, and `CALLING_PATIENTS` are rechecked.

Typical mapping:

| Generic call outcome | OpenChair outcome/fact |
| --- | --- |
| `confirmed` | `ACCEPTED`, then request `outreach.patient_accepted` |
| `declined` or `do_not_call` | `DECLINED`; advance to next candidate |
| `no_answer` | `NO_ANSWER`; apply retry/next-candidate policy |
| `voicemail` | `VOICEMAIL` |
| `busy` | `BUSY` |
| `wrong_number` | `WRONG_NUMBER` |
| `unclear`, `reschedule_requested` | `HUMAN_REVIEW` |
| `technical_failure` | `CALL_FAILED` or operator review |

The generic outcome does not reserve a chair. Workflow must accept the
candidate fact first. Once reservation succeeds, remaining queued candidates
must be canceled or skipped.

## Reliability and privacy

- Queue messages contain internal IDs, expected workflow version, and
  correlation ID—never phone or health context.
- Only one candidate is active at a time for one appointment.
- Duplicate queue delivery cannot create another provider call.
- Ambiguous dispatch failures require review rather than risking duplicate
  contact.
- Consent withdrawal and do-not-call are terminal for new outreach.
- Raw transcripts and recordings are not copied into OpenChair tables. The
  live transcript stays in `call_transcript_lines` and is deleted when the call
  ends; see `docs/call-automation.md`.
- Provider callbacks are authenticated before event claim or mutation.

## Next implementation slice

1. Implement workspace-scoped outreach run and attempt repositories.
2. Adapt one approved candidate into one encrypted generic call job.
3. Persist the generic call/job mapping before queue execution.
4. Translate completed generic outcomes into idempotent outreach facts.
5. Wait for Workflow reservation before stopping the run.
6. enqueue the next candidate only after the current policy resolves;
7. add duplicate delivery, second acceptance, consent withdrawal, exhaustion,
   dead-letter, and cross-workspace tests.

Verify:

```bash
node --test tests/call-automation.test.mjs tests/openchair-outreach.test.mjs tests/openchair-workflow.test.mjs
npm run typecheck
npm run build
```
