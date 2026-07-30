import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { openchairWorkflows } from "@/db/schema";
import { withApiAuth } from "@/lib/auth";
import { resolveLiveOpenChairContext } from "@/lib/openchair/authorization";

type RouteContext = {
  params: Promise<{ appointmentId: string }>;
};

export const GET = withApiAuth(
  async function workflowEvents(_request, context: RouteContext, auth) {
    const { appointmentId } = await context.params;
    const db = getDb();
    const viewer = await resolveLiveOpenChairContext(
      db,
      { workspaceId: auth.workspaceId, userId: auth.userId },
      appointmentId,
    );
    if (!viewer) {
      return Response.json(
        {
          error: {
            code: "appointment_not_found",
            message: "Appointment was not found.",
          },
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const [workflow] = await db
      .select({ version: openchairWorkflows.version })
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.workspaceId, auth.workspaceId),
          eq(openchairWorkflows.appointmentId, appointmentId),
        ),
      )
      .limit(1);
    if (!workflow) {
      return Response.json(
        {
          error: {
            code: "appointment_not_found",
            message: "Appointment was not found.",
          },
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    return new Response(
      `retry: 3000\nevent: workflow-version\ndata: ${JSON.stringify({
        version: workflow.version,
      })}\n\n`,
      {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/event-stream; charset=utf-8",
        },
      },
    );
  },
  "product:use",
);
