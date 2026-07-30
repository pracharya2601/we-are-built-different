import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { openchairWorkflows } from "@/db/schema";
import { withPlatformOwner } from "@/lib/auth";
import { DEMO_PATIENT, getOrCreateDemoRun } from "@/lib/demo";
import { approveOrderedCandidates } from "@/lib/openchair/commands";

export const POST = withPlatformOwner(
  async function selectDemoPatient(request, _context, auth) {
    assertSameOrigin(request);
    const body = (await request.json().catch(() => ({}))) as {
      patientId?: unknown;
      phone?: unknown;
    };
    if (
      body.patientId !== DEMO_PATIENT.id ||
      (body.phone !== undefined && body.phone !== DEMO_PATIENT.phoneNumber)
    ) {
      return Response.json(
        { error: { code: "invalid_demo_patient", message: "Select Maria." } },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
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
    const result = await approveOrderedCandidates(db, {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      appointmentId: run.appointmentId,
      candidateIds: [run.candidateId],
      expectedWorkflowVersion: workflow.version,
      idempotencyKey: `demo-select:${run.appointmentId}`,
    });
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  },
);

function assertSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Error("Demo mutations require a same-origin request.");
  }
}
