import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { createId } from "../lib/data/ids.ts";
import { deriveAccessState } from "../lib/data/subscription-access.ts";

test("internal IDs are opaque, namespaced UUID values", () => {
  const first = createId("usr");
  const second = createId("usr");
  assert.match(first, /^usr_[a-f0-9]{32}$/);
  assert.notEqual(first, second);
});

test("subscription access policy fails closed", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(deriveAccessState({ status: "active" }, now), {
    accessState: "active",
    validUntil: null,
  });
  assert.deepEqual(deriveAccessState({ status: "trialing" }, now), {
    accessState: "trialing",
    validUntil: null,
  });
  assert.equal(
    deriveAccessState(
      {
        status: "past_due",
        graceEndsAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      now,
    ).accessState,
    "grace",
  );
  for (const status of [
    "incomplete",
    "incomplete_expired",
    "canceled",
    "unpaid",
    "paused",
  ]) {
    assert.equal(
      deriveAccessState({ status }, now).accessState,
      "inactive",
      status,
    );
  }
});

test("demo seed is guarded and cannot fabricate billing access", async () => {
  const source = await readFile(
    new URL("../lib/data/demo-seed.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /environment !== "demo"/);
  assert.match(source, /environment !== "development"/);
  assert.match(source, /accessState: "inactive"/);
  assert.doesNotMatch(source, /billingAccounts|subscriptions/);
});

test("baseline migration contains the control-plane invariants", async () => {
  const files = (await readdir(new URL("../drizzle/", import.meta.url))).filter(
    (file) => file.endsWith(".sql"),
  );
  assert.equal(files.length, 1, "fresh scaffold should have one baseline SQL");
  const sql = await readFile(new URL(`../drizzle/${files[0]}`, import.meta.url), "utf8");

  for (const table of [
    "users",
    "identities",
    "workspaces",
    "memberships",
    "billing_accounts",
    "subscriptions",
    "entitlements",
    "provider_inbox_events",
    "outbox_events",
    "audit_log",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }

  assert.match(sql, /identities_issuer_subject_uidx/);
  assert.match(sql, /billing_accounts_workspace_uidx/);
  assert.match(sql, /provider_inbox_provider_event_uidx/);
  assert.match(sql, /entitlements_revision_check/);
  assert.match(sql, /outbox_state_available_idx/);
  assert.match(sql, /`lease_token` text/);
  assert.match(sql, /FOREIGN KEY/);
});
