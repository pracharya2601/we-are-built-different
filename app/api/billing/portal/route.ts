import { handleCreatePortalSession } from "@/lib/billing/handlers";
import { getAppBillingRuntime } from "@/lib/runtime/billing";
import { companyConfig } from "@/lib/config";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  if (!companyConfig.features.billing) {
    return Response.json({ error: "billing_disabled" }, { status: 404 });
  }
  return handleCreatePortalSession(request, getAppBillingRuntime());
}
