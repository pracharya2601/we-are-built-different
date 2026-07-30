import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  commandErrorResponse,
  OpenChairCommandError,
  publishAppointment,
} from "@/lib/openchair/commands";
import { resolveLiveOpenChairContext } from "@/lib/openchair/authorization";

type RouteContext = {
  params: Promise<{ appointmentId: string }>;
};

export const POST = withApiAuth(
  async function publish(request, context: RouteContext, auth) {
    try {
      const { appointmentId } = await context.params;
      const body = await readCommandBody(request);
      const db = getDb();
      const viewer = await resolveLiveOpenChairContext(
        db,
        { workspaceId: auth.workspaceId, userId: auth.userId },
        appointmentId,
      );
      if (!viewer?.permissions.includes("appointment.publish")) {
        throw new OpenChairCommandError(
          "appointment_not_found",
          "Appointment was not found.",
          404,
        );
      }
      const result = await publishAppointment(db, {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        appointmentId,
        expectedWorkflowVersion: body.expectedWorkflowVersion,
        idempotencyKey: body.idempotencyKey,
      });
      return Response.json(result, {
        status: result.duplicate ? 200 : 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return commandErrorResponse(error);
    }
  },
  "product:use",
);

async function readCommandBody(request: Request): Promise<{
  expectedWorkflowVersion: number;
  idempotencyKey: string;
}> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      expectedWorkflowVersion: Number(body.expectedWorkflowVersion),
      idempotencyKey:
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : "",
    };
  } catch {
    throw new OpenChairCommandError(
      "invalid_json",
      "A JSON command body is required.",
    );
  }
}
