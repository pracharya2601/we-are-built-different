import { handleCreateCheckout } from "@/lib/billing/handlers";
import { companyConfig } from "@/lib/config";
import { getAppBillingRuntime } from "@/lib/runtime/billing";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  if (!companyConfig.features.billing) {
    return Response.json({ error: "billing_disabled" }, { status: 404 });
  }
  return handleCreateCheckout(request, getAppBillingRuntime());
}
