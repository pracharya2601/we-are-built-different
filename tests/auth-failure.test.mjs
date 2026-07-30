import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTH_FAILURE_PATH,
  authFailurePath,
  describeAuthFailure,
  normalizeAuthFailureCode,
  prefersHtml,
} from "../lib/auth/failure.ts";

test("known failure codes carry their own copy", () => {
  const expired = describeAuthFailure("missing_transaction");
  assert.match(expired.title, /expired/i);
  assert.equal(expired.retryable, true);

  const membership = describeAuthFailure("membership_required");
  assert.match(membership.title, /no authorized workspace/i);
  assert.equal(membership.retryable, false);
});

test("unknown and absent failure codes fall back to generic copy", () => {
  const fallback = describeAuthFailure(null);
  for (const code of [undefined, "", "not_a_real_code", "__proto__"]) {
    assert.deepEqual(describeAuthFailure(code), fallback);
  }
});

test("only published codes survive normalization into the page URL", () => {
  assert.equal(normalizeAuthFailureCode("invalid_state"), "invalid_state");
  assert.equal(normalizeAuthFailureCode("toString"), null);
  assert.equal(normalizeAuthFailureCode("constructor"), null);
  assert.equal(normalizeAuthFailureCode(null), null);

  assert.equal(
    authFailurePath("authorization_failed", "/dashboard"),
    `${AUTH_FAILURE_PATH}?code=authorization_failed&returnTo=%2Fdashboard`,
  );
  assert.equal(authFailurePath("spoofed_code"), AUTH_FAILURE_PATH);
});

test("every AuthError code the callback can raise reaches the page", async () => {
  // A code that does not survive normalization renders a generic page with no
  // reference at all, which is undiagnosable without the server log.
  const sources = await Promise.all(
    ["../lib/auth/oidc.ts", "../lib/auth/flow.ts"].map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );
  const raised = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/new AuthError\(\s*"([a-z_]+)"/g)) {
      raised.add(match[1]);
    }
  }
  assert.ok(raised.size > 15, `expected many codes, found ${raised.size}`);

  const unreachable = [...raised].filter(
    (code) => normalizeAuthFailureCode(code) === null,
  );
  assert.deepEqual(
    unreachable,
    [],
    `these codes would render with no reference: ${unreachable.join(", ")}`,
  );
});

test("the failure page shows the code but never provider text", async () => {
  const page = await readFile(
    new URL("../app/auth/error/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /normalizeAuthFailureCode\(params\.code\)/);
  assert.match(page, /<code>\{code\}<\/code>/);
  assert.doesNotMatch(page, /error_description|errorDescription/);
});

test("only HTML callers are redirected to the rendered failure page", () => {
  assert.equal(prefersHtml("text/html,application/xhtml+xml"), true);
  assert.equal(prefersHtml("TEXT/HTML"), true);
  assert.equal(prefersHtml("application/json"), false);
  assert.equal(prefersHtml("*/*"), false);
  assert.equal(prefersHtml(null), false);
});

test("the callback logs the Auth0 reason and never renders it", async () => {
  const [callback, failure, page] = await Promise.all([
    readFile(
      new URL("../app/api/auth/callback/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/auth/failure.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/error/page.tsx", import.meta.url), "utf8"),
  ]);

  // The provider reason reaches the server log...
  assert.match(callback, /console\.error\([\s\S]*?error_description/);
  // ...and the browser gets a page instead of a raw JSON body.
  assert.match(callback, /prefersHtml\(request\.headers\.get\("accept"\)\)/);
  assert.match(callback, /authFailurePath\(/);

  // Provider-controlled text must never reach the rendered page.
  assert.doesNotMatch(page, /error_description|errorDescription/);
  assert.doesNotMatch(failure, /searchParams\.get\("error_description"\)/);
  // Copy comes from our own table, keyed by our own code.
  assert.match(page, /describeAuthFailure\(params\.code\)/);
});
