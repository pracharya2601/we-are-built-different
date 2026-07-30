# OpenChair Vapi MVP bridge

OpenChair reuses the encrypted generic call system in `lib/calls`. It does not
send phone numbers in an OpenChair queue message and does not call Vapi
directly.

## Runtime flow

1. Workflow publishes `workflow.outreach_requested`.
2. `OpenChairOutreachService.startOrAdvance` atomically claims the lowest
   ordered eligible candidate. A second invocation returns `busy`.
3. `createEncryptedCallDispatcher` resolves the approved candidate packet,
   encrypts it, creates one generic call job with `maxAttempts: 1`, and queues
   the ID-only generic message.
4. The Vapi end-of-call webhook finishes the generic call and invokes the
   `onCallEnded` integration hook.
5. The OpenChair store maps the linked generic attempt and the service emits
   one workflow fact:
   - `confirmed` -> `outreach.patient_accepted`
   - `declined` or `do_not_call` -> `outreach.patient_declined`
   - `no_answer`, `busy`, `voicemail`, or `wrong_number` ->
     `outreach.call_no_answer`
   - ambiguous or technical results -> operator review
6. An accepted call does not dispatch another candidate. OpenChair waits for
   Workflow to persist the reservation, then handles
   `workflow.patient_reserved` with `handlePatientReserved`. Remaining
   candidates are skipped and no later call job is created.
7. Queue dead letters call `handleDeadLetter`. The run remains paused until an
   operator calls `recover` with `retry` or `skip`. Repeating the same recovery
   is a no-op.

## Hackathon configuration

The live composition needs the shared Vapi environment and webhook setup from
[call automation](../call-automation.md#local-configuration), plus three
OpenChair-only requirements:

- a real internal user ID for the required `call_jobs.created_by_user_id`
- a candidate resolver that returns the decrypted E.164 phone number and the
  approved appointment context
- a Vapi assistant returning structured `outcome` values supported by the
  generic parser, at minimum `confirmed`, `declined`, and `no_answer`

## Deliberately deferred

- parallel candidate calls
- automatic retries after ambiguous provider failures
- Vapi call cancellation
- ranking changes during an active run
- a separate outreach Worker or database
