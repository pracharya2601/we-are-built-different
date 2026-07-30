import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  permissionsForAppointmentRelationships,
  viewerRoleForAppointmentRelationships,
} from "../lib/openchair/authorization/live-context.ts";
import { authorizeWorkflowFrontend } from "../lib/openchair/authorization/frontend-access.ts";

const WORKSPACE_ID = "wsp_11111111111111111111111111111111";

test("live appointment relationships produce only their minimal grants", () => {
  const sponsorRelationships = {
    clinic: false,
    nonprofit: false,
    sponsor: true,
    operator: false,
  };
  const sponsorPermissions =
    permissionsForAppointmentRelationships(sponsorRelationships);
  assert.deepEqual(sponsorPermissions, [
    "appointment.read",
    "funding.read",
    "funding.approve",
    "funding.pay",
  ]);
  assert.equal(
    viewerRoleForAppointmentRelationships(sponsorRelationships),
    "sponsor",
  );

  const access = authorizeWorkflowFrontend(
    {
      subjectId: "usr_sponsor",
      workspaceId: WORKSPACE_ID,
      permissions: sponsorPermissions,
      relationships: sponsorRelationships,
    },
    "FUNDING_APPROVAL",
  );
  assert.equal(access.data["funding.summary"].allowed, true);
  assert.equal(access.data["accepted-patient.identity"].allowed, false);
  assert.equal(access.actions["funding.approve"].allowed, true);
  assert.equal(access.actions["candidate.select"].allowed, false);
  assert.equal(access.actions["outreach.control"].allowed, false);
});

test("operator grants do not imply clinic appointment commands", () => {
  const relationships = {
    clinic: false,
    nonprofit: false,
    sponsor: false,
    operator: true,
  };
  const permissions =
    permissionsForAppointmentRelationships(relationships);
  const access = authorizeWorkflowFrontend(
    {
      subjectId: "usr_operator",
      workspaceId: WORKSPACE_ID,
      permissions,
      relationships,
    },
    "CALLING_PATIENTS",
  );
  assert.equal(viewerRoleForAppointmentRelationships(relationships), "operator");
  assert.equal(access.actions["outreach.control"].allowed, true);
  assert.equal(access.actions["appointment.cancel"].allowed, false);
  assert.equal(access.data["outreach.status"].allowed, true);
});

test("appointment participant migration is appointment scoped", async () => {
  const migration = await readFile(
    new URL(
      "../drizzle/0011_openchair_appointment_participants.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /PRIMARY KEY \(`workspace_id`, `appointment_id`, `user_id`\)/,
  );
  assert.match(
    migration,
    /relationship` in \('clinic', 'nonprofit', 'sponsor'\)/,
  );
});
