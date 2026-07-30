import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("company configuration enables tenant workspaces", async () => {
  const contents = await readFile(
    new URL("../config/company.json", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(contents);

  assert.equal(config.company.id, "openchair");
  assert.equal(config.company.name, "OpenChair");
  assert.equal(config.company.shortName, "OC");
  // Auth0 is the only authentication path; there is no local bypass to disable.
  assert.equal(config.features.authentication, true);
  assert.equal(config.features.multiTenant, true);
  assert.equal(config.features.publicLandingPage, false);
  assert.equal(config.features.billing, true);
  assert.match(config.application.defaultWorkspaceSlug, /^[a-z0-9-]+$/);
  assert.equal(config.entitlements.productAccessKey, "platform_access");
  assert.ok(Array.isArray(config.access.bootstrapOwnerEmails));
  for (const email of config.access.bootstrapOwnerEmails) {
    assert.match(email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  }
});

test("repository has no ChatGPT Sites deployment binding", async () => {
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(viteConfig, /sites-vite-plugin|hosting\.json|sites\(\)/);
});
