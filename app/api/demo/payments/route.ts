import { withApiAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { getDemoPaymentSnapshot } from "@/lib/demo/payments";
import { getOrCreateDemoRun } from "@/lib/demo/state";
import { fundingErrorResponse, FundingError } from "@/lib/openchair/funding";
import { resolveLiveOpenChairContext } from "@/lib/openchair/authorization";

export const runtime = "edge";

export const GET = withApiAuth(
  async function readDemoPayments(_request, _context, auth) {
    try {
      const db = getDb();
      const run = await getOrCreateDemoRun(db, {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      });
      const viewer = await resolveLiveOpenChairContext(
        db,
        { workspaceId: auth.workspaceId, userId: auth.userId },
        run.appointmentId,
      );
      if (!viewer) {
        throw new FundingError(
          "demo_appointment_not_found",
          "The demo appointment was not found.",
          404,
        );
      }
      return Response.json(
        await getDemoPaymentSnapshot(db, {
          workspaceId: auth.workspaceId,
          appointmentId: run.appointmentId,
        }),
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      return fundingErrorResponse(error);
    }
  },
  "product:use",
);
