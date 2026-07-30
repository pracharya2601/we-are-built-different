import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSignInIntent,
  signInIntentLabel,
} from "../lib/auth/sign-in-intent.ts";

test("sign-in intent accepts only the OpenChair entry paths", () => {
  assert.equal(normalizeSignInIntent("service_provider"), "service_provider");
  assert.equal(normalizeSignInIntent("nonprofit"), "nonprofit");
  assert.equal(normalizeSignInIntent("beneficiary"), "beneficiary");
  assert.equal(normalizeSignInIntent("benefactor"), "nonprofit");
  assert.equal(normalizeSignInIntent("other"), "beneficiary");

  for (const value of [
    "owner",
    "admin",
    "service-provider",
    "",
    null,
    undefined,
  ]) {
    assert.equal(normalizeSignInIntent(value), null);
  }
});

test("sign-in intent labels are presentation-only", () => {
  assert.equal(signInIntentLabel("service_provider"), "Service provider");
  assert.equal(signInIntentLabel("nonprofit"), "Nonprofit or sponsor");
  assert.equal(signInIntentLabel("beneficiary"), "Beneficiary");
  assert.equal(signInIntentLabel(null), null);
});
