import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { openchairWorkflows } from "@/db/schema";
import { withPlatformOwner } from "@/lib/auth";
import { getOrCreateDemoRun } from "@/lib/demo";
import { createId } from "@/lib/data";
import { completeAppointmentVisit } from "@/lib/openchair/workflow";

export const POST = withPlatformOwner(
  async function completeDemoVisit(request, _context, auth) {
    assertSameOrigin(request);
    const db = getDb();
    const run = await getOrCreateDemoRun(db, {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
    });
    const workflow = (
      await db
        .select({ version: openchairWorkflows.version })
        .from(openchairWorkflows)
        .where(
          and(
            eq(openchairWorkflows.workspaceId, auth.workspaceId),
            eq(openchairWorkflows.appointmentId, run.appointmentId),
          ),
        )
        .limit(1)
    )[0];
    if (!workflow) throw new Error("The demo workflow was not found.");
    const result = await completeAppointmentVisit(db, {
      workspaceId: auth.workspaceId,
      appointmentId: run.appointmentId,
      expectedVersion: workflow.version,
      idempotencyKey: `demo-complete:${run.appointmentId}`,
      correlationId: createId("corr"),
      actor: { type: "user", id: auth.userId },
    });
    return Response.json(
      { stage: result.state.stage, workflowVersion: result.state.version },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
);

function assertSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Error("Demo mutations require a same-origin request.");
  }
}
