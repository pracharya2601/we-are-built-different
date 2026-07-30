import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthGuard, requireAuthContext } from "@/lib/auth";
import { getDb } from "@/db";
import { getWorkspaceAccess } from "@/lib/data";
import { companyConfig } from "@/lib/config";
import { isStripeConfigured } from "@/lib/billing";

export default function SubscriptionOnboardingPage() {
  return (
    <AuthGuard returnTo="/onboarding/subscription">
      <SubscriptionOnboarding />
    </AuthGuard>
  );
}

async function SubscriptionOnboarding() {
  const auth = await requireAuthContext();
  if (auth.accountType !== "service_provider") {
    redirect("/dashboard/billing");
  }
  const access = await getWorkspaceAccess(
    getDb(),
    auth.workspaceId,
    companyConfig.entitlements.productAccessKey,
  );
  if (["active", "trialing", "grace"].includes(access)) {
    redirect("/dashboard");
  }
  const stripeConfigured = isStripeConfigured();

  return (
    <main className="auth-state-shell">
      <section className="content-card auth-state-card">
        <span className="status-pill warning">Subscription required</span>
        <p className="kicker">Service provider onboarding</p>
        <h1>Activate your practice workspace.</h1>
        <p>
          Service providers use the $20 monthly Pro plan. After Stripe confirms
          the subscription by signed webhook, you’ll continue to the dashboard
          as the workspace administrator.
        </p>
        <form action="/api/billing/checkout" method="post">
          <input name="planKey" type="hidden" value="platform-pro" />
          <button
            className="button button-primary"
            disabled={!stripeConfigured}
            type="submit"
          >
            {stripeConfigured
              ? "Subscribe for $20/month"
              : "Stripe setup required"}
          </button>
        </form>
        <Link className="text-link" href="/api/auth/logout">
          Sign out
        </Link>
      </section>
    </main>
  );
}
