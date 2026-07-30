import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("demo payments keep fixed amounts and verified-webhook state transitions", async () => {
  const [adapter, sponsorRoute, patientRoute, webhookRoute] = await Promise.all([
    readFile(new URL("../lib/demo/payments.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/demo/payments/sponsor/checkout/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/demo/payments/patient/checkout/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/demo/payments/webhook/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(adapter, /sponsor:\s*6_000/u);
  assert.match(adapter, /patient:\s*2_000/u);
  assert.match(adapter, /createAppointmentCheckout/u);
  assert.match(adapter, /input\.workspaceId/u);
  assert.match(adapter, /input\.appointmentId/u);
  assert.match(adapter, /idempotency-key/u);
  assert.match(sponsorRoute, /requireAppointmentSponsor/u);
  assert.match(patientRoute, /payment\.link\.send/u);
  assert.match(webhookRoute, /ingestAppointmentFundingWebhook/u);
  assert.doesNotMatch(
    [adapter, sponsorRoute, patientRoute].join("\n"),
    /status:\s*"PAID"/u,
  );
});
