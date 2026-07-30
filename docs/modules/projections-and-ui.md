# Projection and UI module

## Status

The shared appointment journey, role-safe projection helpers, synthetic fixture
catalog, protected preview page, and fixture API are implemented. Live D1
projection loading and mutation forms are not yet implemented.

## Owns

- Stable `WorkflowProjection` view models.
- Journey-stage presentation and contextual panels.
- Role-safe allowed-action lists.
- Fixture scenarios for deterministic UI development.
- Accessible, responsive presentation of workflow state.

It does not own official workflow state or backend authorization.

## Code map

- `lib/openchair/contracts/views.ts`: projection contract.
- `lib/openchair/projections/workflow-view.ts`: stages and allowed actions.
- `lib/openchair/fixtures`: validated synthetic scenarios.
- `fixtures/openchair`: JSON fixture inputs.
- `app/api/openchair/fixtures/[fixtureName]`: fixture API (authenticated).
- `app/globals.css`: shared presentation styles.
- `tests/openchair-workflow.test.mjs`: projection/fixture alignment.

## Fixture boundary

The fixture API accepts fixture and viewer-role parameters for previewing UI
states. They are synthetic presentation inputs only. The page that once exposed
them unauthenticated has been removed.

They must never:

- create users, payments, calls, or appointments;
- authorize an action;
- enter provider webhooks or ledgers;
- be enabled as a production data fallback;
- be labeled as live operational state.

## Live projection path

The future server projection should:

1. authenticate and recheck workspace membership;
2. load appointment and workflow by `workspaceId` plus appointment ID;
3. load only the beneficiary/funding/outreach fields allowed for that viewer;
4. calculate allowed actions from effective backend permissions and workflow
   stage;
5. return a stable projection without provider secrets or encrypted fields;
6. send commands with expected version and idempotency key.

Hidden buttons are not authorization. Every command route repeats the
permission, ownership, and stage checks.

## Contributor workflow

- Add or update a typed projection field before using it in a component.
- Add a synthetic fixture for every new meaningful state.
- Keep fixture values fictional and non-sensitive.
- Test all actor views: clinic, nonprofit, sponsor, and operator.
- Include desktop and mobile screenshots in UI pull requests.
- Keep money wording accurate: collected/funded is not the same as paid out.

Verify:

```bash
node --test tests/openchair-workflow.test.mjs tests/rendered-html.test.mjs
npm run lint
npm run build
```
