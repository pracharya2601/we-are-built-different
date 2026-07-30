import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { entitlements } from "../../db/schema";
import type {
  BillingStore,
  StripeSubscriptionStatus,
  SubscriptionProjection,
} from "../billing/types";
import {
  claimProviderEvent,
  completeProviderEvent,
  failProviderEvent,
} from "../events";
import {
  getBillingAccountByStripeCustomerId,
  getBillingAccountByWorkspaceId,
  projectWorkspaceAccess,
  upsertStripeBillingAccount,
  upsertStripeSubscription,
  type SubscriptionStatus,
} from "./billing";

function normalizeSubscriptionStatus(
  status: StripeSubscriptionStatus,
): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
    case "canceled":
    case "paused":
      return status;
    default:
      return "incomplete";
  }
}

async function nextEntitlementRevision(
  db: AppDatabase,
  workspaceId: string,
): Promise<number> {
  const current = (
    await db
      .select({ revision: entitlements.revision })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.workspaceId, workspaceId),
          eq(entitlements.key, "platform_access"),
        ),
      )
      .limit(1)
  )[0];
  return (current?.revision ?? 0) + 1;
}

export function createDataBillingStore(db: AppDatabase): BillingStore {
  return {
    async getBillingAccount(workspaceId) {
      const account = await getBillingAccountByWorkspaceId(db, workspaceId);
      return account
        ? {
            workspaceId: account.workspaceId,
            stripeCustomerId: account.providerCustomerId,
          }
        : null;
    },

    async getBillingAccountByStripeCustomerId(stripeCustomerId) {
      const account = await getBillingAccountByStripeCustomerId(
        db,
        stripeCustomerId,
      );
      return account
        ? {
            workspaceId: account.workspaceId,
            stripeCustomerId: account.providerCustomerId,
          }
        : null;
    },

    async setStripeCustomerId(workspaceId, stripeCustomerId) {
      await upsertStripeBillingAccount(db, {
        workspaceId,
        stripeCustomerId,
      });
    },

    async claimStripeEvent(event) {
      const claim = await claimProviderEvent(db, {
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        payload: {
          id: event.id,
          type: event.type,
          created: event.created,
          livemode: event.livemode,
          data: event.data,
        },
        receivedAt: new Date(),
      });
      if (claim.claimed) return { state: "claimed", claimId: claim.id };
      return claim.state === "completed"
        ? { state: "already_processed", claimId: claim.id }
        : { state: "in_progress", claimId: claim.id };
    },

    async completeStripeEvent(claimId) {
      await completeProviderEvent(db, claimId);
    },

    async failStripeEvent(claimId, error) {
      await failProviderEvent(db, claimId, error);
    },

    async upsertSubscriptionProjection(projection: SubscriptionProjection) {
      const account = await upsertStripeBillingAccount(db, {
        workspaceId: projection.workspaceId,
        stripeCustomerId: projection.stripeCustomerId,
      });
      const subscription = await upsertStripeSubscription(db, {
        billingAccountId: account.id,
        stripeSubscriptionId: projection.stripeSubscriptionId,
        stripePriceId: projection.stripePriceId,
        status: normalizeSubscriptionStatus(projection.stripeStatus),
        cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
        currentPeriodEnd: projection.currentPeriodEnd,
        providerUpdatedAt: projection.sourceEventCreatedAt,
      });
      if (!subscription) return;

      const revision = await nextEntitlementRevision(
        db,
        projection.workspaceId,
      );
      await projectWorkspaceAccess(db, {
        workspaceId: projection.workspaceId,
        accessState: projection.accessState,
        revision,
        sourceSubscriptionId: subscription.id,
        validUntil: projection.graceEndsAt,
        eventId: `stripe_${projection.sourceEventId}`,
      });
    },
  };
}
