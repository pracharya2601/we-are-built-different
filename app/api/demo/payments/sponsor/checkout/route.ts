import { withApiAuth } from "@/lib/auth";
import { getOrCreateDemoRun } from "@/lib/demo/state";
import {
  createDemoPaymentCheckout,
  demoCheckoutIdempotencyKey,
} from "@/lib/demo/payments";
import {
  approveAppointmentFunding,
  fundingErrorResponse,
} from "@/lib/openchair/funding";
import { requireAppointmentSponsor } from "@/lib/openchair/sponsors";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

export const runtime = "edge";

export const POST = withApiAuth(
  async function createSponsorDemoCheckout(request, _context, auth) {
    try {
      const funding = getAppointmentFundingRuntime();
      const run = await getOrCreateDemoRun(funding.db, {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      });
      await requireAppointmentSponsor(funding.db, auth, run.appointmentId);
      await approveAppointmentFunding(funding.db, {
        workspaceId: auth.workspaceId,
        appointmentId: run.appointmentId,
        actorUserId: auth.userId,
      });
      const result = await createDemoPaymentCheckout(
        funding.db,
        funding.provider,
        {
          workspaceId: auth.workspaceId,
          appointmentId: run.appointmentId,
          payerType: "sponsor",
          origin: new URL(request.url).origin,
          idempotencyKey: demoCheckoutIdempotencyKey(request, {
            workspaceId: auth.workspaceId,
            appointmentId: run.appointmentId,
            payerType: "sponsor",
          }),
        },
      );
      return Response.json(result, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return fundingErrorResponse(error);
    }
  },
  "product:use",
);
