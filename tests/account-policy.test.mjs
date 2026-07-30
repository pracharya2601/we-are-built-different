import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_POLICIES,
  accountTypeFromSignInIntent,
  planAllowedForAccount,
} from "../lib/accounts/policy.ts";

test("account entry paths map to explicit tenant policies", () => {
  assert.equal(
    accountTypeFromSignInIntent("service_provider"),
    "service_provider",
  );
  assert.equal(accountTypeFromSignInIntent("nonprofit"), "nonprofit");
  assert.equal(accountTypeFromSignInIntent("beneficiary"), "beneficiary");
  assert.equal(ACCOUNT_POLICIES.service_provider.defaultRole, "admin");
  assert.equal(ACCOUNT_POLICIES.service_provider.collaborative, true);
  assert.equal(
    ACCOUNT_POLICIES.service_provider.dashboardRequiresSubscription,
    true,
  );
  assert.equal(ACCOUNT_POLICIES.beneficiary.collaborative, false);
});

test("service providers use Pro while beneficiaries choose either tier", () => {
  assert.equal(
    planAllowedForAccount("service_provider", "platform-lite"),
    false,
  );
  assert.equal(
    planAllowedForAccount("service_provider", "platform-pro"),
    true,
  );
  assert.equal(
    planAllowedForAccount("beneficiary", "platform-lite"),
    true,
  );
  assert.equal(
    planAllowedForAccount("beneficiary", "platform-pro"),
    true,
  );
});
