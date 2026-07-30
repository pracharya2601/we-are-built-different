import type {
  WorkspacePermission,
  WorkspaceRole,
} from "./types";
import { WORKSPACE_PERMISSIONS } from "./types.ts";

export const ROLE_PERMISSIONS: Record<
  WorkspaceRole,
  readonly WorkspacePermission[]
> = {
  owner: [
    "workspace:view",
    "workspace:manage",
    "members:manage",
    "billing:manage",
    "funds:view",
    "funds:manage",
    "product:use",
  ],
  admin: [
    "workspace:view",
    "workspace:manage",
    "members:manage",
    "billing:manage",
    "funds:view",
    "funds:manage",
    "product:use",
  ],
  billing_admin: [
    "workspace:view",
    "billing:manage",
    "product:use",
  ],
  member: ["workspace:view", "product:use"],
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  billing_admin: "Billing administrator",
  member: "Member",
};

export function permissionsForRoles(
  roles: readonly WorkspaceRole[],
): WorkspacePermission[] {
  return [
    ...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? [])),
  ];
}

export function roleHasPermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export type PermissionOverride = {
  permission: WorkspacePermission;
  effect: "allow" | "deny";
};

export function effectivePermissions(
  roles: readonly WorkspaceRole[],
  overrides: readonly PermissionOverride[] = [],
): WorkspacePermission[] {
  const permissions = new Set(permissionsForRoles(roles));
  for (const override of overrides) {
    if (!WORKSPACE_PERMISSIONS.includes(override.permission)) continue;
    if (override.effect === "allow") {
      permissions.add(override.permission);
    } else {
      permissions.delete(override.permission);
    }
  }
  return WORKSPACE_PERMISSIONS.filter((permission) =>
    permissions.has(permission),
  );
}

export function overridesForEffectivePermissions(
  role: WorkspaceRole,
  desired: readonly WorkspacePermission[],
): PermissionOverride[] {
  const base = new Set(permissionsForRoles([role]));
  const effective = new Set(desired);
  return WORKSPACE_PERMISSIONS.flatMap((permission) => {
    if (base.has(permission) === effective.has(permission)) return [];
    return [
      {
        permission,
        effect: effective.has(permission) ? "allow" : "deny",
      } satisfies PermissionOverride,
    ];
  });
}

export function canManageRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin") return false;
  return targetRole !== "owner" && nextRole !== "owner";
}
