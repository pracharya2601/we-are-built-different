# Multi-User Collaboration Contract

## Goal

Multi-user collaboration means more than one authenticated person can use the
same team workspace and, later, the same projects or product account. The
workspace is the tenant and security boundary. A personal workspace remains
single-user; shared product data belongs to a team workspace.

Auth0 answers **who is signing in**. The application database answers **which
workspace they may use and what they may do there**. Stripe subscription state
is also attached to the workspace, so collaborators share the same plan and
entitlements.

Workspace permissions and financial participant roles are different concepts.
An administrator can manage a workspace without being a benefactor,
beneficiary, or service provider. See
[`funds-and-participants.md`](funds-and-participants.md).

## Current Collaboration Flow

1. Each person completes a real Auth0 login and receives a stable internal
   `userId` mapped from Auth0 `iss + sub`.
2. The account entry path creates a private beneficiary workspace or a
   collaborative service-provider/nonprofit workspace.
3. The first service-provider or nonprofit user is the workspace
   administrator. The administrator adds another verified account from
   `/dashboard/workspaces`, or the person enters through the matching Auth0
   Organization.
4. The application creates one membership identified by
   `(workspaceId, userId)`.
5. The person switches to that workspace. The encrypted session stores the
   active `workspaceId`, but every protected request rechecks the current
   membership in D1.

An app-managed member must complete one verified Auth0 login before an
administrator can add their email. Auth0 Organization members are provisioned
as local `member` users on first organization login. Promotion remains an
application-controlled action.

## Roles and Responsibilities

| Role | Workspace | Members | Billing | Product |
| --- | --- | --- | --- | --- |
| Owner (reserved/legacy) | Manage | Manage, including owners | Manage | Use |
| Administrator | Manage | Manage non-owners | Manage | Use |
| Billing administrator | View | No | Manage | Use |
| Member | View | No | No | Use |

The table shows intent, not two different permission sets: `owner` and `admin`
resolve to identical permissions in `ROLE_PERMISSIONS`. The difference is the
separate owner-protection rule in `canManageRole`, which is what stops an
administrator from managing an owner.

The role-to-permission policy lives in `lib/auth/authorization.ts`. New
service-provider and nonprofit workspaces start with an `admin`, then support
`admin`, `billing_admin`, and `member` as nested roles. The `owner` role remains
reserved for legacy workspaces and explicit ownership transfer.

Per-member allow/deny overrides live in
`membership_permission_overrides`. Effective permissions are recalculated
after the current D1 membership is rechecked, so a permission denial takes
effect on the next request. A user cannot suspend their own active membership.

## Core Product Integration

The future core product should treat `workspaceId` as its tenant key and
`userId` as its actor key. Read the active principal from `GET /api/v1/me` and
paid access from
`GET /api/v1/workspaces/:workspaceId/entitlements`.

Every shared resource must belong to a workspace:

```ts
type Project = {
  id: string;
  workspaceId: string;
  name: string;
  version: number;
};
```

For a request such as `GET /projects/:projectId`, the server must:

1. authenticate the session;
2. recheck active workspace membership;
3. load the project using both `projectId` and `auth.workspaceId`;
4. check the required permission and product entitlement;
5. record `auth.userId` as the actor for mutations.

Auth0 roles can be extracted from the verified ID token or API access token.
For an Auth0 Organization, those assertions may seed the first local
membership. They do not bypass the local membership check. `/api/v1/me`
separates token assertions from the effective role and permissions so a core
product does not accidentally authorize from unscoped frontend state.

Never load a project globally and compare tenant ownership only in the browser.
Repository functions should require `workspaceId`, and tenant-owned tables
should have a `workspace_id` index. Events, object storage keys, background
jobs, cache keys, exports, and analytics must carry the same workspace scope.

## Concurrent Product Changes

Shared authorization makes collaboration possible, but it does not by itself
prevent two people from overwriting each other. Mutable product records should
include a revision or `updatedAt` value. Update operations should use optimistic
concurrency and return `409 Conflict` when the supplied revision is stale.
Retryable mutations should accept an idempotency key.

If the product later needs presence, comments, or live editing, publish events
with `workspaceId`, resource ID, actor `userId`, and revision. Realtime channels
must be authorized before subscription and must never use a client-supplied
workspace as proof of access.

## Membership Lifecycle

- **Add:** create a membership only for a verified internal identity or a
  verified Auth0 Organization member.
- **Change role:** enforce the role-assignment policy server-side and append an
  audit event.
- **Suspend:** deny the next protected request immediately; do not wait for the
  Auth0 session to expire.
- **Restore:** reactivate the existing membership instead of creating a second
  record.
- **Transfer ownership:** promote another active member before demoting or
  suspending the final owner.
- **Delete:** prefer suspension first, then apply the documented retention and
  erasure policy.

The scaffold does not yet send app-managed invitation emails. Auth0
Organizations can own the invitation delivery, while local team workspaces
currently add users after their first verified sign-in.

## Verification Checklist

- Two different Auth0 users can select the same team workspace.
- Both receive the same `workspace.id` from `/api/v1/me` and different
  `user.id` values.
- A member cannot manage billing or memberships.
- A billing administrator cannot change members.
- Suspending a user invalidates their next protected request.
- Cross-workspace project IDs return `404` or `403` without leaking metadata.
- A legacy workspace's last active owner cannot be demoted or suspended.
- Service providers cannot reach the dashboard without active, trialing, or
  grace `platform_access`.
- Beneficiary workspaces cannot add users or nested roles.
- Granular permission denials take effect on the next protected request.
- Stripe entitlement changes affect the workspace, not an individual user.
