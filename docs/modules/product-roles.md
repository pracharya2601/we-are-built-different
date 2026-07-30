# Product roles and contributor journeys

This document maps user journeys to technical modules. These product roles are
not workspace authorization roles.

## Service provider or clinic

A service-provider account creates a collaborative team workspace and begins
as a workspace administrator. The current account policy requires the
allowlisted Pro SaaS subscription before dashboard access.

The clinic product journey is:

1. create an available appointment;
2. publish it for candidate selection;
3. monitor funding and outreach;
4. see one reserved patient;
5. complete or cancel the appointment.

Primary modules:

- account policy: `lib/accounts`;
- appointments and workflow: `lib/openchair/appointments`,
  `lib/openchair/workflow`;
- clinic projection: `lib/openchair/projections`;
- SaaS access gate: `lib/billing`;
- future appointment commands and pages: `app/appointments`.

The service provider does not select beneficiaries, confirm provider payments,
or directly mark Vapi outcomes.

## Nonprofit and sponsor

The `nonprofit` account type is a collaborative workspace. Within the
OpenChair projection, nonprofit and sponsor are separate viewer roles:

- nonprofit staff verify beneficiaries and order candidates;
- sponsors approve and pay their contribution.

Primary modules:

- beneficiary and candidate records: `lib/openchair/beneficiaries`;
- funding request and sponsor payment: `lib/openchair/funding`;
- role-safe actions: `lib/openchair/projections`;
- generic participant/ledger records where applicable: `lib/finance`.

A fixture URL such as `?role=sponsor` changes preview presentation only. It
must never grant a live sponsor permission.

The sponsor path end to end is documented in
[Sponsor funding](sponsor-funding.md).

## Beneficiary or patient

A beneficiary account uses a private personal workspace in the current control
plane. The OpenChair beneficiary record separately owns:

- minimum identity and encrypted contact information;
- verification state;
- general dental need and availability;
- contact, AI voice, SMS, and clinic-sharing consent;
- candidate membership and outreach status;
- the patient contribution after one candidate is reserved.

Primary modules:

- account policy: `lib/accounts`;
- beneficiary eligibility: `lib/openchair/beneficiaries`;
- patient payment: `lib/openchair/funding`;
- voice-call transport boundary: `lib/calls`.

Consent is a durable backend condition. A checked frontend box alone is not
sufficient once the live beneficiary workflow is implemented.

## Platform operator

Platform operators monitor automation and operational failures. They are
stored in `platform_operators` and authorized by stable internal `userId`.
They may access the owner call console and structured call logs.

Primary modules:

- durable operator authorization: `lib/data/platform-operators.ts`;
- owner guard: `lib/auth/platform.ts`;
- call console and API: `app/dashboard/admin/calls`,
  `app/api/v1/admin/calls`;
- queue consumer and callback processing: `lib/calls`, `worker/index.ts`.

Platform-owner access is global operational access. It must not be inferred
from an ordinary workspace `owner` role.

## Workspace authorization roles

| Workspace role | Typical capability |
| --- | --- |
| `owner` | Reserved/legacy full workspace and ownership management |
| `admin` | Workspace, member, billing, funds, and product management |
| `billing_admin` | Workspace view, billing management, product use |
| `member` | Workspace view and product use |

Always check the exact effective permission in the backend. Product-role
labels describe what a screen should show; workspace permissions determine
whether an action may execute.
