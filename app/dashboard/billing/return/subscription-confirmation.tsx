"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_ATTEMPTS = 30;

export function SubscriptionConfirmation({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let canceled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/entitlements`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            entitlements?: Array<{ active?: boolean }>;
          };
          if (payload.entitlements?.some((item) => item.active)) {
            router.replace("/dashboard?subscription=active");
            router.refresh();
            return;
          }
        }
      } catch {
        // A transient localhost connection failure should be retried.
      }

      if (canceled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      timeout = setTimeout(poll, 1_000);
    };

    void poll();
    return () => {
      canceled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [router, workspaceId]);

  return (
    <div className="content-card" style={{ maxWidth: 680, margin: "16vh auto" }}>
      <p className="kicker">Checkout returned</p>
      <h1 style={{ fontSize: "3rem", letterSpacing: "-0.05em" }}>
        {timedOut
          ? "Payment received. Confirmation is delayed."
          : "We’re confirming the subscription."}
      </h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
        {timedOut
          ? "Keep the Stripe listener running, then return to the overview to check the verified subscription state."
          : "This page will open the dashboard automatically after a signed Stripe webhook activates the local entitlement."}
      </p>
      <Link className="button button-primary" href="/dashboard">
        Return to overview
      </Link>
    </div>
  );
}
