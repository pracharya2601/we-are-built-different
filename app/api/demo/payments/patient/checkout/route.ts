import { withApiAuth } from "@/lib/auth";
import {
  createDemoPaymentCheckout,
  demoCheckoutIdempotencyKey,
} from "@/lib/demo/payments";
import { getOrCreateDemoRun } from "@/lib/demo/state";
import { fundingErrorResponse, FundingError } from "@/lib/openchair/funding";
import { resolveLiveOpenChairContext } from "@/lib/openchair/authorization";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

export const runtime = "edge";

export const POST = withApiAuth(
  async function createPatientDemoCheckout(request, _context, auth) {
    try {
      const body = await readBody(request);
      if (body.patientId !== "maria") {
        throw new FundingError(
          "invalid_demo_patient",
          "The demo payment link is only available for the selected patient.",
          400,
        );
      }
      const funding = getAppointmentFundingRuntime();
      const run = await getOrCreateDemoRun(funding.db, {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      });
      const viewer = await resolveLiveOpenChairContext(
        funding.db,
        { workspaceId: auth.workspaceId, userId: auth.userId },
        run.appointmentId,
      );
      if (!viewer?.permissions.includes("payment.link.send")) {
        throw new FundingError(
          "demo_appointment_not_found",
          "The demo appointment was not found.",
          404,
        );
      }
      const result = await createDemoPaymentCheckout(
        funding.db,
        funding.provider,
        {
          workspaceId: auth.workspaceId,
          appointmentId: run.appointmentId,
          payerType: "patient",
          origin: new URL(request.url).origin,
          idempotencyKey: demoCheckoutIdempotencyKey(request, {
            workspaceId: auth.workspaceId,
            appointmentId: run.appointmentId,
            payerType: "patient",
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

async function readBody(request: Request): Promise<{ patientId?: unknown }> {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === "object") {
      return value as { patientId?: unknown };
    }
  } catch {
    // The stable funding error below is safer than surfacing parser details.
  }
  throw new FundingError(
    "invalid_demo_payment_request",
    "A valid patient payment request is required.",
    400,
  );
}
