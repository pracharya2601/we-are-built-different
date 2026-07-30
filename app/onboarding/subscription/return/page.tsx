import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { AuthGuard, requireAuthContext } from "@/lib/auth";
import { companyConfig } from "@/lib/config";
import { getWorkspaceAccess } from "@/lib/data";
import { SubscriptionConfirmation } from "@/app/dashboard/billing/return/subscription-confirmation";

export default function SubscriptionOnboardingReturnPage() {
  return (
    <AuthGuard returnTo="/onboarding/subscription/return">
      <SubscriptionReturn />
    </AuthGuard>
  );
}

async function SubscriptionReturn() {
  const auth = await requireAuthContext();
  const access = await getWorkspaceAccess(
    getDb(),
    auth.workspaceId,
    companyConfig.entitlements.productAccessKey,
  );
  if (["active", "trialing", "grace"].includes(access)) {
    redirect("/dashboard?subscription=active");
  }
  return <SubscriptionConfirmation workspaceId={auth.workspaceId} />;
}
