import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  commandErrorResponse,
  OpenChairCommandError,
} from "../lib/openchair/commands/errors.ts";

test("command errors preserve conflict status and disable caching", async () => {
  const response = commandErrorResponse(
    new OpenChairCommandError(
      "stale_workflow_version",
      "The workflow changed.",
      409,
    ),
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: {
      code: "stale_workflow_version",
      message: "The workflow changed.",
    },
  });
});

test("live command routes use authenticated workspace identity", async () => {
  const [publishRoute, candidatesRoute, service] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/openchair/appointments/[appointmentId]/publish/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/v1/openchair/appointments/[appointmentId]/candidates/approve/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/openchair/commands/service.ts", import.meta.url),
      "utf8",
    ),
  ]);

  for (const route of [publishRoute, candidatesRoute]) {
    assert.match(route, /withApiAuth\(/u);
    assert.match(route, /"product:use"/u);
    assert.match(route, /workspaceId: auth\.workspaceId/u);
    assert.match(route, /userId: auth\.userId/u);
    assert.doesNotMatch(route, /searchParams|get\("role"\)/u);
  }
  assert.match(service, /openchairCommandReceipts/u);
  assert.match(service, /openchairWorkflowHistory/u);
  assert.match(service, /eq\(openchairWorkflows\.workspaceId, workspaceId\)/u);
  assert.match(
    service,
    /eq\(openchairCandidates\.workspaceId, input\.workspaceId\)/u,
  );
});

test("live updates expose only the scoped workflow version", async () => {
  const [eventsRoute, client] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/openchair/appointments/[appointmentId]/events/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/appointments/[appointmentId]/live-updates.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(eventsRoute, /resolveLiveOpenChairContext/u);
  assert.match(eventsRoute, /openchairWorkflows\.workspaceId/u);
  assert.match(eventsRoute, /text\/event-stream/u);
  assert.match(eventsRoute, /workflow-version/u);
  assert.doesNotMatch(eventsRoute, /searchParams|get\("role"\)/u);
  assert.match(client, /new EventSource/u);
  assert.match(client, /version <= latestVersion\.current/u);
  assert.match(client, /router\.refresh\(\)/u);
  assert.match(client, /events\.close\(\)/u);
});
