import {
  fundingErrorResponse,
  ingestAppointmentFundingWebhook,
} from "@/lib/openchair/funding";
import { getAppointmentFundingRuntime } from "@/lib/runtime/appointment-funding";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  try {
    const runtime = getAppointmentFundingRuntime();
    const result = await ingestAppointmentFundingWebhook(request, runtime);
    return Response.json({ received: true, ...result });
  } catch (error) {
    return fundingErrorResponse(error);
  }
}
