import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guards = await readFile(
  new URL("../lib/auth/guards.tsx", import.meta.url),
  "utf8",
);
const context = await readFile(
  new URL("../lib/auth/context.ts", import.meta.url),
  "utf8",
);

test("a session naming a missing workspace re-authenticates, not forbidden", () => {
  // requireCurrentMembership raises membership_required with status 403 when the
  // session's workspace no longer has an active membership. Handling that purely
  // by status would send the user to /auth/forbidden, whose only link returns to
  // the dashboard -- a loop with no way out but clearing cookies by hand.
  assert.match(context, /"membership_required"/);
  assert.match(guards, /error\.code === "membership_required"/);

  // The membership branch must be checked before the generic 403 branch.
  const membershipAt = guards.indexOf('error.code === "membership_required"');
  const forbiddenAt = guards.indexOf('error.status === 403');
  assert.ok(membershipAt > -1 && forbiddenAt > -1);
  assert.ok(
    membershipAt < forbiddenAt,
    "membership_required must be handled before the generic 403 redirect",
  );
});

test("the stale-session redirect forces a fresh Auth0 login", () => {
  // Without force=1 the login route short-circuits on the still-valid cookie
  // and redirects straight back, so the session would never be reissued.
  assert.match(guards, /force \? "&force=1" : ""/);

  const login = guards.slice(guards.indexOf("const loginUrl"));
  assert.match(login, /redirect\(loginUrl\(true\)\)/);
});

test("a genuine permission denial still reaches /auth/forbidden", () => {
  assert.match(guards, /redirect\("\/auth\/forbidden"\)/);
  assert.match(context, /"permission_denied"/);
});

test("API handlers keep returning JSON rather than redirecting", async () => {
  // withApiAuth serves machine callers; a redirect would corrupt their contract.
  const withApiAuth = guards.slice(guards.indexOf("export function withApiAuth"));
  assert.match(withApiAuth, /Response\.json/);
  assert.doesNotMatch(withApiAuth, /redirect\(/);
});
