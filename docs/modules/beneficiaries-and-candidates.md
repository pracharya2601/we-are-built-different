# Beneficiary and candidate module

## Status

Types, repository ports, consent-aware eligibility, D1 tables, and workflow
tests exist. Encrypted CRUD, verification UI, candidate ordering commands, and
live projections are not yet implemented.

## Owns

- Minimum beneficiary identity and encrypted contact information.
- Preferred language and general dental need.
- Availability and verification state.
- Contact, AI voice-call, SMS, and clinic-sharing consent.
- Candidate membership, sequence, approval, and outreach-facing status.

It does not own the appointment stage, Vapi transport, or payment truth.

## Code and data map

- `lib/openchair/beneficiaries/types.ts`
- `lib/openchair/beneficiaries/eligibility.ts`
- `lib/openchair/beneficiaries/repository.ts`
- `openchair_beneficiaries` and `openchair_candidates` in `db/schema.ts`
- beneficiary eligibility coverage in `tests/openchair-workflow.test.mjs`

## Eligibility contract

`beneficiaryCanBeSelected()` currently requires:

- active beneficiary status;
- verified identity state;
- availability today;
- contact consent;
- AI voice-call consent;
- clinic data-sharing consent.

The live repository and command handler must repeat these checks at selection
time. A list rendered earlier may be stale.

## Privacy and authorization

- Encrypt contact details before D1 persistence.
- Keep only a masked phone suffix in normal list projections.
- Do not place raw contact data in queue messages, URLs, logs, fixtures, or
  audit metadata.
- Scope every read and write by `workspaceId`.
- Nonprofit selection permissions and beneficiary self-service permissions
  must be explicit backend actions.
- Consent withdrawal prevents new outreach immediately and requires queued
  work to be canceled or reviewed.

## Next implementation slice

1. Define the encrypted contact packet and its dedicated encryption secret.
2. Implement workspace-scoped create, update, verify, suspend, and list
   repository operations.
3. Add candidate-selection commands with ordered unique sequence numbers.
4. Recheck eligibility and workflow stage inside the command handler.
5. Freeze or version candidate ordering once outreach starts.
6. Emit `candidates.approved` only after the ordered list commits.
7. Add consent withdrawal, cross-workspace, stale-version, and duplicate tests.

Verify:

```bash
node --test tests/openchair-workflow.test.mjs tests/privacy-guard.test.mjs
npm run typecheck
```
