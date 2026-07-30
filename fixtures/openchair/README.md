# OpenChair workflow fixtures

These fixtures contain synthetic scenario facts for the shared appointment
page. They never represent provider-confirmed payment or authentication state.
Production routes must assemble the same `WorkflowProjection` contract from
stored workflow facts and verified provider events.

- `open-slot.json`
- `patient-selection.json`
- `funding-approval.json`
- `calling-no-answer.json`
- `calling-connected.json`
- `patient-accepted.json`
- `payment-waiting.json`
- `chair-filled.json`
- `workflow-failed.json`
- `workflow-expired.json`
