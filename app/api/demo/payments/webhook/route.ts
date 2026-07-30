import {
  fundingErrorResponse,
  ingestAppointmentFundingWebhook,
} from "@/lib/openchair/funding";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const funding = getAppointmentFundingRuntime();
    const result = await ingestAppointmentFundingWebhook(request, funding);
    return Response.json(
      { received: true, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return fundingErrorResponse(error);
  }
}
