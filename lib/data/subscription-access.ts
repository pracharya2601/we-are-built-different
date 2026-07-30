import type { AccessState } from "./access";
import type { SubscriptionStatus } from "./billing";

export function deriveAccessState(
  subscription: {
    status: SubscriptionStatus;
    graceEndsAt?: Date | null;
  },
  now = new Date(),
): { accessState: AccessState; validUntil: Date | null } {
  if (subscription.status === "active") {
    return { accessState: "active", validUntil: null };
  }
  if (subscription.status === "trialing") {
    return { accessState: "trialing", validUntil: null };
  }
  if (
    subscription.status === "past_due" &&
    subscription.graceEndsAt &&
    subscription.graceEndsAt.getTime() > now.getTime()
  ) {
    return {
      accessState: "grace",
      validUntil: subscription.graceEndsAt,
    };
  }
  return { accessState: "inactive", validUntil: null };
}

