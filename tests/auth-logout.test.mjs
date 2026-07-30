import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(
  new URL("../app/api/auth/logout/route.ts", import.meta.url),
  "utf8",
);

test("logout returns the browser to the registered app origin", () => {
  // Auth0 matches Allowed Logout URLs by exact string. A deep path such as
  // http://localhost:3000/dashboard is rejected outright, so the route must
  // never interpolate a caller-supplied path into the Auth0 returnTo.
  assert.match(
    routeSource,
    /logoutUrl\.searchParams\.set\("returnTo", `\$\{config\.appBaseUrl\}\/`\)/,
  );
  assert.doesNotMatch(routeSource, /new URL\(returnTo, config\.appBaseUrl\)/);
  assert.doesNotMatch(routeSource, /searchParams\.get\("returnTo"\)/);
});

test("logout clears both the session and any in-flight transaction", () => {
  assert.match(routeSource, /clearCookie\(SESSION_COOKIE\)/);
  assert.match(routeSource, /clearCookie\(TRANSACTION_COOKIE\)/);
});

test("logout ends the Auth0 session, not just the local cookie", () => {
  assert.match(routeSource, /new URL\("v2\/logout", config\.issuer\)/);
  assert.match(routeSource, /set\("client_id", config\.clientId\)/);
  // No local-persona branch may reappear here.
  assert.doesNotMatch(routeSource, /isLocalAuthEnabled|LOCAL_AUTH_COOKIE/);
});
