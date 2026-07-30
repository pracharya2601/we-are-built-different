# Workflow contract

## Happy path

```text
OPEN_SLOT
  -- appointment.published -->
PATIENT_SELECTION
  -- candidates.approved -->
FUNDING_APPROVAL
  -- funding.sponsor_paid -->
CALLING_PATIENTS
  -- outreach.patient_accepted -->
PATIENT_ACCEPTED
  -- funding.patient_checkout_created -->
PAYMENT
  -- funding.patient_paid -->
CHAIR_FILLED
  -- workflow.visit_completed -->
COMPLETED
```

When sponsor payment is verified, Workflow emits
`workflow.outreach_requested`. When one candidate is accepted, Workflow emits
`workflow.patient_reserved`. A patient statement or Vapi structured output
does not reserve the chair until Workflow accepts the fact.

## Terminal behavior

- Clinic cancellation moves a non-terminal workflow to `CANCELED`.
- Appointment cutoff moves a non-terminal workflow to `EXPIRED`.
- Candidate exhaustion currently moves the workflow to `EXPIRED` with
  `candidate_pool_exhausted`. This is an explicit MVP policy and can later
  become a distinct `UNFILLED` state.
- Unrecoverable operational failure moves the workflow to `FAILED`.
- Payment failure alone remains in `PAYMENT` so the patient can retry before
  expiration.

Facts received after a terminal state fail closed, except exact duplicate
terminal facts.

## Concurrency

Every command supplies `expectedWorkflowVersion`. A stale command returns a
conflict. The accepted candidate is stored on the same versioned workflow
record. Therefore, two acceptance facts cannot both reserve a patient.

## Money condition

`CHAIR_FILLED` requires all of the following:

- sponsor payment confirmed by a verified provider event;
- patient payment confirmed by a verified provider event;
- one candidate reserved by Workflow;
- workflow currently in `PAYMENT`;
- workflow not canceled, expired, or failed.

The MVP UI says the appointment is funded or that contributions are collected.
It must not say the clinic received funds until a payout mechanism exists.

## Presentation journey

The shared page always renders:

```text
Open Slot
→ Patients Selected
→ Funding Approval
→ Calling Patients
→ Patient Accepted
→ Payment
→ Chair Filled
```

`COMPLETED`, `EXPIRED`, `CANCELED`, and `FAILED` are workflow states rather than
additional journey steps. They alter the presentation status of the last
reached journey step.
