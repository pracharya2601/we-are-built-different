import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("landing route contains the SaaS control-plane value proposition", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /SaaS control plane/i);
  assert.match(page, /Auth0/);
  assert.match(page, /Stripe/);
  assert.match(page, /Workspace entitlements/);
  assert.match(page, /href="\/api\/auth\/login\?returnTo=\/dashboard"/);
});

test("landing source exposes navigation without embedding credentials", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /href="\/architecture"/);
  assert.match(page, /href="\/api\/auth\/login\?returnTo=\/dashboard"/);
  assert.match(layout, /Built Different — SaaS Control Plane/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(
    `${page}\n${layout}`,
    /AUTH0_CLIENT_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/,
  );
});
