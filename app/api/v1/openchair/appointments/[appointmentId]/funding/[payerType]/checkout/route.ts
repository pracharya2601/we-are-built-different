import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  createAppointmentCheckout,
  FundingError,
  fundingErrorResponse,
} from "@/lib/openchair/funding";
import { requireAppointmentSponsor } from "@/lib/openchair/sponsors";
import { resolveLiveOpenChairContext } from "@/lib/openchair/authorization";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

type RouteContext = {
  params: Promise<{ appointmentId: string; payerType: string }>;
};

export const POST = withApiAuth(
  async function createCheckout(request, context: RouteContext, auth) {
    try {
      const { appointmentId, payerType } = await context.params;
      if (payerType !== "sponsor" && payerType !== "patient") {
        throw new FundingError(
          "invalid_payer_type",
          "Payer type must be sponsor or patient.",
          404,
        );
      }
      const runtime = getAppointmentFundingRuntime();
      if (payerType === "sponsor") {
        await requireAppointmentSponsor(getDb(), auth, appointmentId);
      } else {
        const viewer = await resolveLiveOpenChairContext(
          runtime.db,
          { workspaceId: auth.workspaceId, userId: auth.userId },
          appointmentId,
        );
        if (!viewer?.permissions.includes("payment.link.send")) {
          throw new FundingError(
            "appointment_not_found",
            "Appointment was not found.",
            404,
          );
        }
      }
      const origin = new URL(request.url).origin;
      const suppliedKey = request.headers.get("idempotency-key")?.trim();
      const idempotencyKey =
        suppliedKey && /^[A-Za-z0-9_:.+-]{8,128}$/u.test(suppliedKey)
          ? `appointment:${auth.workspaceId}:${appointmentId}:${payerType}:${suppliedKey}`
          : `appointment:${auth.workspaceId}:${appointmentId}:${payerType}:${crypto.randomUUID()}`;
      const checkout = await createAppointmentCheckout(
        runtime.db,
        runtime.provider,
        {
          workspaceId: auth.workspaceId,
          appointmentId,
          payerType,
          idempotencyKey,
          successUrl: `${origin}/appointments/${appointmentId}?checkout=returned`,
          cancelUrl: `${origin}/appointments/${appointmentId}?checkout=canceled`,
        },
      );
      return Response.json(checkout, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return fundingErrorResponse(error);
    }
  },
  "product:use",
);
