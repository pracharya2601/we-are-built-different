import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthConfigurationError,
  getAuthConfig,
  getAuthConfigurationStatus,
  isAuth0Configured,
} from "../lib/auth/config.ts";
import { buildAuthorizationUrl } from "../lib/auth/oidc.ts";

const BASE_ENV = {
  AUTH0_DOMAIN: "example-tenant.us.auth0.com",
  AUTH0_CLIENT_ID: "client-id-value",
  AUTH0_CLIENT_SECRET: "client-secret-value",
  AUTH0_APP_BASE_URL: "http://localhost:3000",
  AUTH0_SESSION_SECRET: "a".repeat(64),
};

const MANAGED_KEYS = [
  ...Object.keys(BASE_ENV),
  "AUTH0_AUDIENCE",
  "AUTH0_ROLES_CLAIM",
  "AUTH0_PERMISSIONS_CLAIM",
];

function withEnv(overrides, run) {
  const saved = Object.fromEntries(
    MANAGED_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of MANAGED_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Auth0 configuration is complete without an API audience", () => {
  withEnv({ AUTH0_AUDIENCE: undefined }, () => {
    const status = getAuthConfigurationStatus();
    assert.equal(status.configured, true);
    assert.deepEqual(status.missing, []);
    assert.equal(isAuth0Configured(), true);

    const config = getAuthConfig();
    assert.equal(config.audience, null);
    assert.equal(config.issuer, "https://example-tenant.us.auth0.com/");
  });
});

test("an absent audience is omitted from the authorization request", () => {
  withEnv({ AUTH0_AUDIENCE: undefined }, () => {
    const url = new URL(
      buildAuthorizationUrl(getAuthConfig(), {
        redirectUri: "http://localhost:3000/api/auth/callback",
        state: "state-value",
        nonce: "nonce-value",
        codeChallenge: "challenge-value",
      }),
    );
    // Sending audience= for an API that does not exist is what Auth0 rejects
    // with "Service not found", so the parameter must be absent entirely.
    assert.equal(url.searchParams.has("audience"), false);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });
});

test("a configured audience is still requested", () => {
  withEnv({ AUTH0_AUDIENCE: "https://api.example.com/control-plane" }, () => {
    const config = getAuthConfig();
    assert.equal(config.audience, "https://api.example.com/control-plane");

    const url = new URL(
      buildAuthorizationUrl(config, {
        redirectUri: "http://localhost:3000/api/auth/callback",
        state: "state-value",
        nonce: "nonce-value",
        codeChallenge: "challenge-value",
      }),
    );
    assert.equal(
      url.searchParams.get("audience"),
      "https://api.example.com/control-plane",
    );
  });
});

test("the remaining Auth0 settings still fail closed", () => {
  for (const missing of [
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_APP_BASE_URL",
    "AUTH0_SESSION_SECRET",
  ]) {
    withEnv({ [missing]: undefined }, () => {
      const status = getAuthConfigurationStatus();
      assert.equal(status.configured, false, `${missing} must be required`);
      assert.ok(status.missing.includes(missing));
      assert.equal(isAuth0Configured(), false);
      assert.throws(() => getAuthConfig(), AuthConfigurationError);
    });
  }
});

test("a short session secret is still rejected", () => {
  withEnv({ AUTH0_SESSION_SECRET: "too-short" }, () => {
    assert.equal(isAuth0Configured(), false);
    assert.ok(
      getAuthConfigurationStatus().missing.includes("AUTH0_SESSION_SECRET"),
    );
    assert.throws(() => getAuthConfig(), AuthConfigurationError);
  });
});
