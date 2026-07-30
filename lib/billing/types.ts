export const PLATFORM_ACCESS_FEATURE = "platform_access" as const;

export type AccessState = "active" | "trialing" | "grace" | "inactive";

export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "canceled"
  | "paused";

export type BillingAuthContext = {
  userId: string;
  workspaceId: string;
  email: string | null;
};

export interface BillingAuthAdapter {
  requireBillingManager(request: Request): Promise<BillingAuthContext>;
}

export type BillingAccount = {
  workspaceId: string;
  stripeCustomerId: string | null;
};

export type StripeEventClaim =
  | { state: "claimed"; claimId: string }
  | { state: "already_processed"; claimId: string }
  | { state: "in_progress"; claimId: string };

export type SubscriptionProjection = {
  workspaceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeStatus: StripeSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  accessState: AccessState;
  featureKey: typeof PLATFORM_ACCESS_FEATURE;
  graceEndsAt: Date | null;
  sourceEventId: string;
  sourceEventCreatedAt: Date;
};

/**
 * Persistence port implemented by the data layer. `claimStripeEvent` must be
 * atomic. A failed claim must become retryable rather than permanently
 * suppressing later Stripe deliveries. Projection upserts must ignore events
 * older than the last stored `sourceEventCreatedAt`.
 */
export interface BillingStore {
  getBillingAccount(workspaceId: string): Promise<BillingAccount | null>;
  getBillingAccountByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<BillingAccount | null>;
  setStripeCustomerId(
    workspaceId: string,
    stripeCustomerId: string,
  ): Promise<void>;
  claimStripeEvent(event: StripeEventEnvelope): Promise<StripeEventClaim>;
  completeStripeEvent(claimId: string): Promise<void>;
  failStripeEvent(claimId: string, error: string): Promise<void>;
  upsertSubscriptionProjection(
    projection: SubscriptionProjection,
  ): Promise<void>;
}

export type BillingPlan = {
  key: string;
  priceId: string;
  label: string;
};

export type BillingConfig =
  | {
      mode: "demo";
      plans: ReadonlyMap<string, BillingPlan>;
      gracePeriodSeconds: number;
      webhookToleranceSeconds: number;
    }
  | {
      mode: "live";
      secretKey: string;
      webhookSecret: string | null;
      expectedLivemode: boolean | null;
      plans: ReadonlyMap<string, BillingPlan>;
      gracePeriodSeconds: number;
      webhookToleranceSeconds: number;
    };

export type StripeEventEnvelope = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: unknown;
  };
};

export type StripeCustomer = {
  id: string;
};

export type StripeHostedSession = {
  id: string;
  url: string;
};

export interface StripeBillingGateway {
  createCustomer(input: {
    workspaceId: string;
    email: string | null;
    idempotencyKey: string;
  }): Promise<StripeCustomer>;
  createCheckoutSession(input: {
    workspaceId: string;
    stripeCustomerId: string;
    plan: BillingPlan;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<StripeHostedSession>;
  createPortalSession(input: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<StripeHostedSession>;
}

export type BillingRuntime = {
  auth: BillingAuthAdapter;
  store: BillingStore;
  config: BillingConfig;
  stripe: StripeBillingGateway | null;
  now?: () => Date;
};
