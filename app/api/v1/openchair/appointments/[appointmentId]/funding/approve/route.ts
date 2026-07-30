import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import { fundingErrorResponse } from "@/lib/openchair/funding/errors";
import { approveAppointmentFunding } from "@/lib/openchair/funding/service";

type RouteContext = {
  params: Promise<{ appointmentId: string }>;
};

export const POST = withApiAuth(
  async function approveFunding(
    _request,
    context: RouteContext,
    auth,
  ) {
    try {
      const { appointmentId } = await context.params;
      const fundingRequest = await approveAppointmentFunding(
        getDb(),
        {
          workspaceId: auth.workspaceId,
          appointmentId,
          actorUserId: auth.userId,
        },
      );
      return Response.json(
        { fundingRequest },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      return fundingErrorResponse(error);
    }
  },
  "funds:manage",
);
