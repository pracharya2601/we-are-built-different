import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = integer("created_at", { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);
const updatedAt = integer("updated_at", { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name"),
    primaryEmail: text("primary_email"),
    status: text("status", { enum: ["active", "disabled", "deleted"] })
      .notNull()
      .default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "users_status_check",
      sql`${table.status} in ('active', 'disabled', 'deleted')`,
    ),
    index("users_status_idx").on(table.status),
  ],
);

export const identities = sqliteTable(
  "identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("identities_issuer_subject_uidx").on(
      table.issuer,
      table.subject,
    ),
    index("identities_user_id_idx").on(table.userId),
  ],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    auth0OrganizationId: text("auth0_organization_id"),
    status: text("status", { enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("workspaces_slug_uidx").on(table.slug),
    uniqueIndex("workspaces_auth0_organization_id_uidx").on(
      table.auth0OrganizationId,
    ),
    check(
      "workspaces_status_check",
      sql`${table.status} in ('active', 'suspended', 'deleted')`,
    ),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "admin", "billing_admin", "member"],
    })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["invited", "active", "suspended"] })
      .notNull()
      .default("active"),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      name: "memberships_workspace_user_pk",
      columns: [table.workspaceId, table.userId],
    }),
    check(
      "memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'billing_admin', 'member')`,
    ),
    check(
      "memberships_status_check",
      sql`${table.status} in ('invited', 'active', 'suspended')`,
    ),
    index("memberships_user_status_idx").on(table.userId, table.status),
    index("memberships_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const billingAccounts = sqliteTable(
  "billing_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider", { enum: ["stripe"] })
      .notNull()
      .default("stripe"),
    providerCustomerId: text("provider_customer_id").notNull(),
    billingEmail: text("billing_email"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("billing_accounts_workspace_uidx").on(table.workspaceId),
    uniqueIndex("billing_accounts_provider_customer_uidx").on(
      table.provider,
      table.providerCustomerId,
    ),
    check(
      "billing_accounts_provider_check",
      sql`${table.provider} in ('stripe')`,
    ),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerPriceId: text("provider_price_id"),
    status: text("status", {
      enum: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
    }).notNull(),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    currentPeriodStart: integer("current_period_start", {
      mode: "timestamp_ms",
    }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    canceledAt: integer("canceled_at", { mode: "timestamp_ms" }),
    providerUpdatedAt: integer("provider_updated_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("subscriptions_provider_subscription_uidx").on(
      table.providerSubscriptionId,
    ),
    index("subscriptions_billing_account_status_idx").on(
      table.billingAccountId,
      table.status,
    ),
    check(
      "subscriptions_status_check",
      sql`${table.status} in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')`,
    ),
  ],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    accessState: text("access_state", {
      enum: ["active", "trialing", "grace", "inactive"],
    })
      .notNull()
      .default("inactive"),
    sourceSubscriptionId: text("source_subscription_id").references(
      () => subscriptions.id,
      { onDelete: "set null" },
    ),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    revision: integer("revision").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      name: "entitlements_workspace_key_pk",
      columns: [table.workspaceId, table.key],
    }),
    check(
      "entitlements_access_state_check",
      sql`${table.accessState} in ('active', 'trialing', 'grace', 'inactive')`,
    ),
    check("entitlements_revision_check", sql`${table.revision} > 0`),
    index("entitlements_workspace_access_idx").on(
      table.workspaceId,
      table.accessState,
    ),
  ],
);

export const providerInboxEvents = sqliteTable(
  "provider_inbox_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    state: text("state", {
      enum: ["processing", "completed", "failed"],
    })
      .notNull()
      .default("processing"),
    attempts: integer("attempts").notNull().default(1),
    lastError: text("last_error"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("provider_inbox_provider_event_uidx").on(
      table.provider,
      table.providerEventId,
    ),
    index("provider_inbox_state_received_idx").on(
      table.state,
      table.receivedAt,
    ),
    check(
      "provider_inbox_state_check",
      sql`${table.state} in ('processing', 'completed', 'failed')`,
    ),
    check("provider_inbox_attempts_check", sql`${table.attempts} > 0`),
  ],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    state: text("state", {
      enum: ["pending", "processing", "published", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: integer("available_at", { mode: "timestamp_ms" }).notNull(),
    leaseToken: text("lease_token"),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("outbox_state_available_idx").on(table.state, table.availableAt),
    index("outbox_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt,
    ),
    check(
      "outbox_state_check",
      sql`${table.state} in ('pending', 'processing', 'published', 'failed')`,
    ),
    check("outbox_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("outbox_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type", {
      enum: ["user", "service", "system"],
    }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
  },
  (table) => [
    index("audit_log_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("audit_log_actor_occurred_idx").on(
      table.actorType,
      table.actorId,
      table.occurredAt,
    ),
    index("audit_log_action_occurred_idx").on(table.action, table.occurredAt),
    check(
      "audit_log_actor_type_check",
      sql`${table.actorType} in ('user', 'service', 'system')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type BillingAccount = typeof billingAccounts.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type ProviderInboxEvent = typeof providerInboxEvents.$inferSelect;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
