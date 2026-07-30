import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { openchairWorkflows } from "@/db/schema";
import { withPlatformOwner } from "@/lib/auth";
import { getOrCreateDemoRun } from "@/lib/demo";
import { createId } from "@/lib/data";
import { publishAppointment } from "@/lib/openchair/workflow";

export const POST = withPlatformOwner(
  async function publishDemoAppointment(request, _context, auth) {
    assertSameOrigin(request);
    const db = getDb();
    const run = await getOrCreateDemoRun(db, {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
    });
    const workflow = await requireWorkflow(
      db,
      auth.workspaceId,
      run.appointmentId,
    );
    const result = await publishAppointment(db, {
      workspaceId: auth.workspaceId,
      appointmentId: run.appointmentId,
      expectedVersion: workflow.version,
      idempotencyKey: `demo-publish:${run.appointmentId}`,
      correlationId: createId("corr"),
      actor: { type: "user", id: auth.userId },
    });
    return Response.json(
      { stage: result.state.stage, workflowVersion: result.state.version },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
);

async function requireWorkflow(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  appointmentId: string,
) {
  const workflow = (
    await db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.workspaceId, workspaceId),
          eq(openchairWorkflows.appointmentId, appointmentId),
        ),
      )
      .limit(1)
  )[0];
  if (!workflow) throw new Error("The demo workflow was not found.");
  return workflow;
}

function assertSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Error("Demo mutations require a same-origin request.");
  }
}
