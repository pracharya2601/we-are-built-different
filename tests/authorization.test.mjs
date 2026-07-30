import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageRole,
  effectivePermissions,
  overridesForEffectivePermissions,
  permissionsForRoles,
  roleHasPermission,
} from "../lib/auth/authorization.ts";

test("workspace roles grant only their documented permissions", () => {
  assert.equal(roleHasPermission("owner", "members:manage"), true);
  assert.equal(roleHasPermission("owner", "funds:manage"), true);
  assert.equal(roleHasPermission("admin", "members:manage"), true);
  assert.equal(roleHasPermission("admin", "funds:manage"), true);
  assert.equal(roleHasPermission("billing_admin", "billing:manage"), true);
  assert.equal(roleHasPermission("billing_admin", "funds:view"), false);
  assert.equal(roleHasPermission("billing_admin", "members:manage"), false);
  assert.equal(roleHasPermission("member", "product:use"), true);
  assert.equal(roleHasPermission("member", "billing:manage"), false);
  assert.deepEqual(permissionsForRoles(["member"]), [
    "workspace:view",
    "product:use",
  ]);
});

test("only owners may assign or modify owner memberships", () => {
  assert.equal(canManageRole("owner", "owner", "admin"), true);
  assert.equal(canManageRole("owner", "member", "owner"), true);
  assert.equal(canManageRole("admin", "member", "billing_admin"), true);
  assert.equal(canManageRole("admin", "owner", "member"), false);
  assert.equal(canManageRole("admin", "member", "owner"), false);
  assert.equal(canManageRole("billing_admin", "member", "member"), false);
});

test("granular overrides change role defaults with deny taking effect", () => {
  const desired = [
    "workspace:view",
    "billing:manage",
    "product:use",
  ];
  const overrides = overridesForEffectivePermissions("member", desired);
  assert.deepEqual(overrides, [
    { permission: "billing:manage", effect: "allow" },
  ]);
  assert.deepEqual(effectivePermissions(["member"], overrides), desired);
  assert.deepEqual(
    effectivePermissions(["admin"], [
      { permission: "funds:manage", effect: "deny" },
    ]),
    [
      "workspace:view",
      "workspace:manage",
      "billing:manage",
      "funds:view",
      "members:manage",
      "product:use",
    ],
  );
});

test("workspace APIs enforce membership, organization, and last-owner boundaries", async () => {
  const [switchRoute, memberRoute, context] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/workspaces/switch/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/v1/workspaces/[workspaceId]/members/[userId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/auth/context.ts", import.meta.url), "utf8"),
  ]);

  assert.match(switchRoute, /organization_reauthentication_required/);
  assert.match(switchRoute, /getActiveWorkspaceMembership/);
  assert.match(memberRoute, /last_owner_required/);
  assert.match(memberRoute, /last_workspace_admin_required/);
  assert.match(memberRoute, /cannot_change_own_role/);
  assert.match(memberRoute, /canManageRole/);
  assert.match(context, /requireCurrentMembership/);
  assert.doesNotMatch(context, /session\.permissions\.includes/);
});
