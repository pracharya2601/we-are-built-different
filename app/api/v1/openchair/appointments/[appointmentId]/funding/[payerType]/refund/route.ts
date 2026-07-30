import { withApiAuth } from "@/lib/auth";
import {
  FundingError,
  fundingErrorResponse,
  requestAppointmentRefund,
} from "@/lib/openchair/funding";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

type RouteContext = {
  params: Promise<{ appointmentId: string; payerType: string }>;
};

export const POST = withApiAuth(
  async function refundPayment(request, context: RouteContext, auth) {
    try {
      const { appointmentId, payerType } = await context.params;
      if (payerType !== "sponsor" && payerType !== "patient") {
        throw new FundingError(
          "invalid_payer_type",
          "Payer type must be sponsor or patient.",
          404,
        );
      }
      const suppliedKey = request.headers.get("idempotency-key")?.trim();
      if (!suppliedKey || !/^[A-Za-z0-9_:.+-]{8,128}$/u.test(suppliedKey)) {
        throw new FundingError(
          "missing_idempotency_key",
          "Refund requests require an Idempotency-Key header.",
          400,
        );
      }
      const runtime = getAppointmentFundingRuntime();
      const refund = await requestAppointmentRefund(
        runtime.db,
        runtime.provider,
        {
          workspaceId: auth.workspaceId,
          appointmentId,
          payerType,
          idempotencyKey: `appointment-refund:${auth.workspaceId}:${appointmentId}:${payerType}:${suppliedKey}`,
        },
      );
      return Response.json(
        { requested: true, ...refund },
        { status: 202, headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      return fundingErrorResponse(error);
    }
  },
  "funds:manage",
);
