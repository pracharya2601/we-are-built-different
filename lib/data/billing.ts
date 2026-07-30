import { and, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  billingAccounts,
  entitlements,
  outboxEvents,
  subscriptions,
} from "../../db/schema";
import { createId } from "./ids";
import type { AccessState } from "./access";

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export async function getBillingAccountByWorkspaceId(
  db: AppDatabase,
  workspaceId: string,
) {
  return (
    (await db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.workspaceId, workspaceId))
      .limit(1))[0] ?? null
  );
}

export async function getBillingAccountByStripeCustomerId(
  db: AppDatabase,
  stripeCustomerId: string,
) {
  return (
    (await db
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.provider, "stripe"),
          eq(billingAccounts.providerCustomerId, stripeCustomerId),
        ),
      )
      .limit(1))[0] ?? null
  );
}

export async function upsertStripeBillingAccount(
  db: AppDatabase,
  input: {
    id?: string;
    workspaceId: string;
    stripeCustomerId: string;
    billingEmail?: string | null;
  },
) {
  const now = new Date();
  const [account] = await db
    .insert(billingAccounts)
    .values({
      id: input.id ?? createId("bil"),
      workspaceId: input.workspaceId,
      provider: "stripe",
      providerCustomerId: input.stripeCustomerId,
      billingEmail: input.billingEmail ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: billingAccounts.workspaceId,
      set: {
        providerCustomerId: input.stripeCustomerId,
        billingEmail: input.billingEmail ?? null,
        updatedAt: now,
      },
    })
    .returning();
  return account;
}

export async function upsertStripeSubscription(
  db: AppDatabase,
  input: {
    id?: string;
    billingAccountId: string;
    stripeSubscriptionId: string;
    stripePriceId?: string | null;
    status: SubscriptionStatus;
    cancelAtPeriodEnd?: boolean;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    trialEndsAt?: Date | null;
    canceledAt?: Date | null;
    providerUpdatedAt: Date;
  },
) {
  const now = new Date();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      id: input.id ?? createId("sub"),
      billingAccountId: input.billingAccountId,
      providerSubscriptionId: input.stripeSubscriptionId,
      providerPriceId: input.stripePriceId ?? null,
      status: input.status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      trialEndsAt: input.trialEndsAt ?? null,
      canceledAt: input.canceledAt ?? null,
      providerUpdatedAt: input.providerUpdatedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.providerSubscriptionId,
      set: {
        billingAccountId: input.billingAccountId,
        providerPriceId: input.stripePriceId ?? null,
        status: input.status,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        currentPeriodStart: input.currentPeriodStart ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        trialEndsAt: input.trialEndsAt ?? null,
        canceledAt: input.canceledAt ?? null,
        providerUpdatedAt: input.providerUpdatedAt,
        updatedAt: now,
      },
      setWhere: sql`excluded.provider_updated_at >= ${subscriptions.providerUpdatedAt}`,
    })
    .returning();
  return subscription ?? null;
}

export async function projectWorkspaceAccess(
  db: AppDatabase,
  input: {
    workspaceId: string;
    accessState: AccessState;
    revision: number;
    sourceSubscriptionId?: string | null;
    validUntil?: Date | null;
    eventId?: string;
  },
): Promise<boolean> {
  const now = new Date();
  const entitlementMutation = db
    .insert(entitlements)
    .values({
      workspaceId: input.workspaceId,
      key: "platform_access",
      accessState: input.accessState,
      sourceSubscriptionId: input.sourceSubscriptionId ?? null,
      validUntil: input.validUntil ?? null,
      revision: input.revision,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [entitlements.workspaceId, entitlements.key],
      set: {
        accessState: input.accessState,
        sourceSubscriptionId: input.sourceSubscriptionId ?? null,
        validUntil: input.validUntil ?? null,
        revision: input.revision,
        updatedAt: now,
      },
      setWhere: sql`excluded.revision > ${entitlements.revision}`,
    })
    .returning({ revision: entitlements.revision });

  const eventId = input.eventId ?? createId("evt");
  const eventMutation = db
    .insert(outboxEvents)
    .values({
      id: eventId,
      aggregateType: "workspace",
      aggregateId: input.workspaceId,
      eventType: "workspace.entitlements.changed.v1",
      schemaVersion: 1,
      payload: {
        eventId,
        workspaceId: input.workspaceId,
        key: "platform_access",
        accessState: input.accessState,
        revision: input.revision,
        validUntil: input.validUntil?.toISOString() ?? null,
      },
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outboxEvents.id })
    .returning({ id: outboxEvents.id });

  const [entitlementResult, eventResult] = await db.batch([
    entitlementMutation,
    eventMutation,
  ]);

  return entitlementResult.length === 1 && eventResult.length === 1;
}
