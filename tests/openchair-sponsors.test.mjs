import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decideSponsorAccess } from "../lib/openchair/sponsors/access.ts";

const WORKSPACE = "wsp_demo";
const APPOINTMENT = "appt_demo";
const USER = "usr_sponsor";

function sponsorRecord(overrides = {}) {
  return {
    id: "spon_demo",
    workspaceId: WORKSPACE,
    appointmentId: APPOINTMENT,
    userId: USER,
    status: "ACTIVE",
    ...overrides,
  };
}

function decide(permissions, sponsor) {
  return decideSponsorAccess({
    permissions,
    workspaceId: WORKSPACE,
    appointmentId: APPOINTMENT,
    sponsor,
  });
}

test("an active sponsor record grants funding access without admin rights", () => {
  const decision = decide(["workspace:view", "product:use"], sponsorRecord());
  assert.equal(decision.allowed, true);
  assert.equal(decision.via, "sponsor_relationship");
});

test("funds:manage remains the administrator override", () => {
  const decision = decide(
    ["workspace:view", "funds:manage", "product:use"],
    null,
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.via, "funds_manage");
});

test("product:use alone never authorizes appointment funding", () => {
  const decision = decide(["workspace:view", "product:use"], null);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "not_a_sponsor");
});

test("a sponsor record from another workspace is denied, not honored", () => {
  const decision = decide(
    ["product:use"],
    sponsorRecord({ workspaceId: "wsp_other" }),
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "workspace_mismatch");
});

test("a sponsor record for another appointment is denied", () => {
  const decision = decide(
    ["product:use"],
    sponsorRecord({ appointmentId: "appt_other" }),
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "appointment_mismatch");
});

test("revoking sponsorship immediately removes funding access", () => {
  const decision = decide(
    ["product:use"],
    sponsorRecord({ status: "REVOKED" }),
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "sponsorship_revoked");
});

test("a member without product:use is denied before any record is consulted", () => {
  const decision = decide(["workspace:view"], sponsorRecord());
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "missing_product_use");
});

test("every funding route pairs product:use with the sponsor relationship", async () => {
  const base = new URL(
    "../app/api/v1/openchair/appointments/[appointmentId]/funding/",
    import.meta.url,
  );
  const routes = [
    "approve/route.ts",
    "[payerType]/checkout/route.ts",
    "[payerType]/refund/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(route, base), "utf8");
    assert.match(
      source,
      /requireAppointmentSponsor\(/u,
      `${route} must enforce the sponsor relationship`,
    );
    assert.match(
      source,
      /"product:use",/u,
      `${route} must gate on product:use`,
    );
    assert.doesNotMatch(
      source,
      /"funds:manage",/u,
      `${route} must not require workspace-wide fund management`,
    );
  }
});

test("sponsorship is durable state rather than a claim or query parameter", async () => {
  const [schema, migration, repository] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0010_daffy_johnny_storm.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/openchair/sponsors/repository.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(schema, /openchair_appointment_sponsors/u);
  assert.match(migration, /CREATE TABLE `openchair_appointment_sponsors`/u);
  assert.match(
    migration,
    /openchair_appointment_sponsors_appointment_user_uidx/u,
  );
  // Every lookup must be workspace-scoped; a bare appointment+user read would
  // let one tenant's sponsorship authorize another tenant's appointment.
  assert.match(repository, /eq\(openchairAppointmentSponsors\.workspaceId/u);
});
