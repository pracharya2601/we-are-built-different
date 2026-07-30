import type {
  AccessState,
  StripeSubscriptionStatus,
} from "./types";

export type AccessProjection = {
  state: AccessState;
  graceEndsAt: Date | null;
};

export function projectSubscriptionAccess(input: {
  status: StripeSubscriptionStatus;
  currentPeriodEnd: Date | null;
  gracePeriodSeconds: number;
  now?: Date;
}): AccessProjection {
  if (input.status === "active") {
    return { state: "active", graceEndsAt: null };
  }
  if (input.status === "trialing") {
    return { state: "trialing", graceEndsAt: null };
  }
  if (input.status !== "past_due") {
    return { state: "inactive", graceEndsAt: null };
  }

  const now = input.now ?? new Date();
  const graceBase = input.currentPeriodEnd ?? now;
  const graceEndsAt = new Date(
    graceBase.getTime() + input.gracePeriodSeconds * 1000,
  );
  return graceEndsAt > now
    ? { state: "grace", graceEndsAt }
    : { state: "inactive", graceEndsAt };
}
