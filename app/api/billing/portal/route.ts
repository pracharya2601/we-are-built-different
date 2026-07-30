import { handleCreatePortalSession } from "@/lib/billing/handlers";
import { getAppBillingRuntime } from "@/lib/runtime/billing";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  return handleCreatePortalSession(request, getAppBillingRuntime());
}
