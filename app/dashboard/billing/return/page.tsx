import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { requireAuthContext } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { getWorkspaceAccess } from "@/lib/data";

import { SubscriptionConfirmation } from "./subscription-confirmation";

export default async function BillingReturnPage() {
  const auth = await requireAuthContext();
  const accessState = await getWorkspaceAccess(
    getDb(),
    auth.workspaceId,
    companyConfig.entitlements.productAccessKey,
  );
  if (["active", "trialing", "grace"].includes(accessState)) {
    redirect("/dashboard?subscription=active");
  }

  return <SubscriptionConfirmation workspaceId={auth.workspaceId} />;
}
