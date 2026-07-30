# Granular frontend access

## Security boundary

Auth0 proves identity and supplies verified token assertions. It does not decide
which OpenChair fields or actions the browser receives.

The live projection flow is:

```text
verified Auth0 session
→ current D1 membership recheck
→ effective local permission overrides
→ appointment/resource relationship checks
→ OpenChair data and action grants
→ server-side projection filtering
→ browser
```

The frontend renders the server decision. It never calculates authorization
from an Auth0 role, account-type label, URL parameter, or hidden button.

## Projection contract

Every `WorkflowProjection` carries two complete decision maps:

```ts
type WorkflowFrontendAccess = {
  data: Record<FrontendDataGrant, AccessDecision>;
  actions: Record<OpenChairAction, AccessDecision>;
};
```

Each decision is explicit:

```ts
type AccessDecision = {
  allowed: boolean;
  reason:
    | "not_granted"
    | "stage_not_active"
    | "disclosure_not_reached"
    | null;
};
```

Missing decisions are not treated as allowed.

## Data grants

- `appointment.summary`
- `workflow.journey`
- `beneficiary.list`
- `candidate.order`
- `candidate.outcomes`
- `funding.summary`
- `outreach.status`
- `outreach.transcript`
- `accepted-patient.identity`
- `accepted-patient.contact`
- `payment.status`
- `workflow.failure-detail`

Patient payment-link delivery uses the separate `payment.link.send` action. A
sponsor's `funding.pay` grant never authorizes disclosure of patient identity
or delivery of the patient's payment link.

The server removes unauthorized fields before serialization. CSS, React
conditionals, and disabled controls are not privacy boundaries.

Examples:

- A sponsor receives funding and payment status without candidate identity.
- A nonprofit receives its candidate list and outcomes without outreach
  transcript access.
- A clinic receives accepted-patient identity only after the disclosure stage
  is reached.
- An operator may receive outreach status and transcripts without clinic
  appointment-management actions.

## Action decisions

Action decisions combine:

1. effective subject permission;
2. active workspace membership;
3. relationship to the appointment;
4. workflow stage;
5. member-level permission overrides;
6. terminal-state rules.

The browser may show an enabled command only when the corresponding decision is
allowed. The command endpoint must independently repeat authorization,
resource, idempotency, and expected-version checks. A previously rendered
decision is not proof that a later command remains authorized.

The reusable policy entry point is
`lib/openchair/authorization/frontend-access.ts`. Its input contains effective
OpenChair permissions plus stored appointment relationships. Even an explicit
permission is denied when the subject lacks the required clinic, nonprofit,
sponsor, or operator relationship.

## Fixture preview

The role selector on `/appointments/demo-openchair` exists only to inspect
synthetic projections. When `features.authentication` is `false`, this
server-rendered preview is public so product UI work can continue without an
Auth0 session. It does not create a user, workspace membership, or access to
tenant data, and its actions remain disabled.

The fixture API endpoint remains authenticated in every mode and marks its
response with:

```text
X-OpenChair-Data-Source: synthetic-fixture
```

Role query parameters must not exist on the future live workflow endpoint.
That endpoint derives grants from the authenticated server context and stored
resource relationships.
