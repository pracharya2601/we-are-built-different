import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("landing route presents the OpenChair care-capacity model", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /Fill the chair/i);
  assert.match(page, /Sponsor-backed care credits/i);
  assert.match(page, /Private patient claims/i);
  assert.match(page, /starting with\s+dental/i);
  assert.match(page, /\/api\/auth\/login\?returnTo=\/dashboard/);
});

test("landing source exposes navigation without embedding credentials", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /nidcr\.nih\.gov/);
  assert.match(page, /\/api\/auth\/login\?returnTo=\/dashboard/);
  assert.match(layout, /companyConfig\.application\.name/);
  assert.match(layout, /\/og-openchair\.png/);
  assert.doesNotMatch(
    `${page}\n${layout}`,
    /AUTH0_CLIENT_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/,
  );
});

test("sign-in starts Auth0 directly without an intermediate role page", async () => {
  const [page, login, flow] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/flow.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /\/api\/auth\/login\?returnTo=\/dashboard/);
  assert.doesNotMatch(page, /\/auth\/select-role/);
  assert.match(login, /normalizeSignInIntent/);
  assert.match(flow, /signInIntent/);
});

test("authentication and billing have no demo fallback", async () => {
  const sources = await Promise.all(
    [
      "../lib/auth/config.ts",
      "../lib/auth/flow.ts",
      "../lib/billing/config.ts",
      "../app/api/auth/login/route.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.doesNotMatch(sources.join("\n"), /createDemoSession|mode: "demo"/);
});

test("auth-off focus mode exposes only the synthetic workflow preview", async () => {
  const [page, appointment, api] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/appointments/[appointmentId]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/openchair/fixtures/[fixtureName]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(page, /companyConfig\.features\.authentication/);
  assert.match(page, /\/appointments\/demo-openchair/);
  assert.match(appointment, /if \(!companyConfig\.features\.authentication\)/);
  assert.match(appointment, /<AuthGuard/);
  assert.match(api, /withApiAuth/);
});

test("Auth0 API audience is required for token permissions", async () => {
  const config = await readFile(
    new URL("../lib/auth/config.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /REQUIRED_AUTH0_ENV/);
  assert.match(config, /"AUTH0_AUDIENCE"/);
  assert.match(config, /audience: string/);
});

test("protected pages and APIs use shared auth guards", async () => {
  const [layout, guards, login] = await Promise.all([
    readFile(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/guards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<AuthGuard returnTo="\/dashboard">/);
  assert.match(guards, /export function withApiAuth/);
  assert.match(guards, /authSetupPath/);
  assert.match(login, /AuthConfigurationError/);
  assert.match(login, /getAuthSession\(request\)/);
});

test("checkout return waits for verified entitlement and then redirects", async () => {
  const [page, confirmation] = await Promise.all([
    readFile(
      new URL("../app/dashboard/billing/return/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/billing/return/subscription-confirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(page, /getWorkspaceAccess/);
  assert.match(page, /redirect\("\/dashboard\?subscription=active"\)/);
  assert.match(confirmation, /\/entitlements/);
  assert.match(confirmation, /router\.replace/);
});

test("pricing router page submits only the stable dynamic price contract", async () => {
  const [page, form] = await Promise.all([
    readFile(
      new URL(
        "../app/dashboard/billing/pricing-router/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/billing/pricing-router/dynamic-checkout-form.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(page, /requireWorkspacePermission\("billing:manage"\)/);
  assert.match(form, /\/api\/v1\/billing\/checkout/);
  assert.match(form, /type: "dynamic-monthly"/);
  assert.match(form, /"Idempotency-Key"/);
  assert.match(form, /dollarsToCents/);
  assert.doesNotMatch(`${page}\n${form}`, /price_[A-Za-z0-9]/);
});

test("Auth0 requests use Cloudflare-compatible redirect handling", async () => {
  const oidc = await readFile(
    new URL("../lib/auth/oidc.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(oidc, /redirect:\s*["']error["']/);
  assert.match(oidc, /redirect:\s*["']manual["']/);
});

test("workspace console exposes tenant switching and role management", async () => {
  const [page, consoleSource, layout] = await Promise.all([
    readFile(
      new URL("../app/dashboard/workspaces/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/workspaces/workspace-console.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/dashboard/layout.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /\/dashboard\/workspaces/);
  assert.doesNotMatch(layout, /\/architecture|Integration/);
  assert.match(page, /Role permissions/);
  assert.match(consoleSource, /\/api\/v1\/workspaces\/switch/);
  assert.match(consoleSource, /Create and switch/);
  assert.match(consoleSource, /Add member/);
});

test("granular settings prevent administrator self-lockout", async () => {
  const [route, settings] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/workspaces/[workspaceId]/members/[userId]/permissions/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/settings/access-settings.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(route, /cannot_change_own_permissions/);
  assert.match(route, /workspace_view_required/);
  assert.match(settings, /member\.userId === currentUserId/);
  assert.match(settings, /permission === "workspace:view"/);
});

test("dashboard overview directs each account through onboarding", async () => {
  const page = await readFile(
    new URL("../app/dashboard/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /requireAuthContext/);
  assert.match(page, /Create the operating structure/);
  assert.match(page, /No nested roles/);
  assert.match(page, /Granular access/);
  assert.match(page, /Beneficiaries can choose either Lite or Pro/);
  assert.match(page, /getWorkspaceAccess/);
});

test("repository documents the multi-user product contract", async () => {
  const [readme, collaboration, agents] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(
      new URL("../docs/multi-user-collaboration.md", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  ]);

  assert.match(readme, /Multi-user collaboration contract/);
  assert.match(collaboration, /workspace is the tenant and security boundary/i);
  assert.match(collaboration, /optimistic\s+concurrency/i);
  assert.match(collaboration, /last active owner/i);
  assert.match(collaboration, /GET \/api\/v1\/me/);
  assert.match(agents, /multi-user-collaboration\.md/);
});

test("finance dashboard separates participant records from subscriptions", async () => {
  const [page, setup, layout] = await Promise.all([
    readFile(
      new URL("../app/dashboard/finance/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/dashboard/finance/finance-setup.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireWorkspacePermission\("funds:view"\)/);
  assert.match(page, /Benefactor/);
  assert.match(page, /Beneficiary/);
  assert.match(page, /Service provider/);
  assert.match(page, /subscription billing stays separate/i);
  assert.match(setup, /\/api\/v1\/finance\/participants/);
  assert.match(setup, /\/api\/v1\/finance\/pools/);
  assert.match(layout, /\/dashboard\/finance/);
});
