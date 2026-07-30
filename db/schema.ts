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
    workspaceType: text("workspace_type", { enum: ["personal", "team"] })
      .notNull()
      .default("team"),
    accountType: text("account_type", {
      enum: ["service_provider", "nonprofit", "beneficiary"],
    })
      .notNull()
      .default("beneficiary"),
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
    check(
      "workspaces_type_check",
      sql`${table.workspaceType} in ('personal', 'team')`,
    ),
    check(
      "workspaces_account_type_check",
      sql`${table.accountType} in ('service_provider', 'nonprofit', 'beneficiary')`,
    ),
    index("workspaces_account_type_status_idx").on(
      table.accountType,
      table.status,
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

export const membershipPermissionOverrides = sqliteTable(
  "membership_permission_overrides",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    effect: text("effect", { enum: ["allow", "deny"] }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      name: "membership_permission_overrides_pk",
      columns: [table.workspaceId, table.userId, table.permission],
    }),
    check(
      "membership_permission_overrides_effect_check",
      sql`${table.effect} in ('allow', 'deny')`,
    ),
    index("membership_permission_overrides_member_idx").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const participantRoles = sqliteTable(
  "participant_roles",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["service_provider", "benefactor", "beneficiary"],
    }).notNull(),
    status: text("status", { enum: ["active", "suspended"] })
      .notNull()
      .default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      name: "participant_roles_workspace_user_role_pk",
      columns: [table.workspaceId, table.userId, table.role],
    }),
    check(
      "participant_roles_role_check",
      sql`${table.role} in ('service_provider', 'benefactor', 'beneficiary')`,
    ),
    check(
      "participant_roles_status_check",
      sql`${table.status} in ('active', 'suspended')`,
    ),
    index("participant_roles_workspace_role_idx").on(
      table.workspaceId,
      table.role,
      table.status,
    ),
    index("participant_roles_user_idx").on(table.userId, table.status),
  ],
);

export const fundingPools = sqliteTable(
  "funding_pools",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["open", "frozen", "closed"] })
      .notNull()
      .default("open"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("funding_pools_currency_check", sql`length(${table.currency}) = 3`),
    check(
      "funding_pools_status_check",
      sql`${table.status} in ('open', 'frozen', 'closed')`,
    ),
    index("funding_pools_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const financialAccounts = sqliteTable(
  "financial_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    poolId: text("pool_id")
      .notNull()
      .references(() => fundingPools.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    accountType: text("account_type", {
      enum: ["asset", "liability", "revenue", "expense", "equity"],
    }).notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("financial_accounts_pool_key_uidx").on(
      table.poolId,
      table.key,
    ),
    check(
      "financial_accounts_type_check",
      sql`${table.accountType} in ('asset', 'liability', 'revenue', 'expense', 'equity')`,
    ),
    check(
      "financial_accounts_status_check",
      sql`${table.status} in ('active', 'closed')`,
    ),
    check(
      "financial_accounts_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    index("financial_accounts_workspace_idx").on(table.workspaceId),
  ],
);

export const serviceProviderAccounts = sqliteTable(
  "service_provider_accounts",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider", { enum: ["stripe"] })
      .notNull()
      .default("stripe"),
    providerAccountId: text("provider_account_id").notNull(),
    onboardingStatus: text("onboarding_status", {
      enum: ["pending", "restricted", "enabled", "disabled"],
    })
      .notNull()
      .default("pending"),
    chargesEnabled: integer("charges_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    payoutsEnabled: integer("payouts_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      name: "service_provider_accounts_workspace_user_pk",
      columns: [table.workspaceId, table.userId],
    }),
    uniqueIndex("service_provider_accounts_provider_uidx").on(
      table.provider,
      table.providerAccountId,
    ),
    check(
      "service_provider_accounts_provider_check",
      sql`${table.provider} in ('stripe')`,
    ),
    check(
      "service_provider_accounts_status_check",
      sql`${table.onboardingStatus} in ('pending', 'restricted', 'enabled', 'disabled')`,
    ),
    index("service_provider_accounts_workspace_status_idx").on(
      table.workspaceId,
      table.onboardingStatus,
    ),
  ],
);

export const financialTransactions = sqliteTable(
  "financial_transactions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    poolId: text("pool_id")
      .notNull()
      .references(() => fundingPools.id, { onDelete: "restrict" }),
    kind: text("kind", {
      enum: [
        "benefactor_deposit",
        "beneficiary_allocation",
        "service_provider_payment",
        "refund",
        "adjustment",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "posted", "failed", "reversed"],
    }).notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    benefactorUserId: text("benefactor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    beneficiaryUserId: text("beneficiary_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    serviceProviderUserId: text("service_provider_user_id").references(
      () => users.id,
      { onDelete: "restrict" },
    ),
    provider: text("provider", { enum: ["stripe", "manual"] }),
    providerPaymentId: text("provider_payment_id"),
    providerTransferId: text("provider_transfer_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    memo: text("memo"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    reversedTransactionId: text("reversed_transaction_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("financial_transactions_workspace_idempotency_uidx").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("financial_transactions_provider_payment_uidx").on(
      table.provider,
      table.providerPaymentId,
    ),
    uniqueIndex("financial_transactions_provider_transfer_uidx").on(
      table.provider,
      table.providerTransferId,
    ),
    check(
      "financial_transactions_kind_check",
      sql`${table.kind} in ('benefactor_deposit', 'beneficiary_allocation', 'service_provider_payment', 'refund', 'adjustment')`,
    ),
    check(
      "financial_transactions_status_check",
      sql`${table.status} in ('pending', 'posted', 'failed', 'reversed')`,
    ),
    check("financial_transactions_amount_check", sql`${table.amount} > 0`),
    check(
      "financial_transactions_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    index("financial_transactions_pool_occurred_idx").on(
      table.poolId,
      table.occurredAt,
    ),
    index("financial_transactions_benefactor_idx").on(
      table.benefactorUserId,
      table.occurredAt,
    ),
    index("financial_transactions_beneficiary_idx").on(
      table.beneficiaryUserId,
      table.occurredAt,
    ),
    index("financial_transactions_service_provider_idx").on(
      table.serviceProviderUserId,
      table.occurredAt,
    ),
  ],
);

export const financialLedgerEntries = sqliteTable(
  "financial_ledger_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => financialTransactions.id, { onDelete: "restrict" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    direction: text("direction", { enum: ["debit", "credit"] }).notNull(),
    amount: integer("amount").notNull(),
    createdAt,
  },
  (table) => [
    check(
      "financial_ledger_entries_direction_check",
      sql`${table.direction} in ('debit', 'credit')`,
    ),
    check(
      "financial_ledger_entries_amount_check",
      sql`${table.amount} > 0`,
    ),
    index("financial_ledger_entries_transaction_idx").on(table.transactionId),
    index("financial_ledger_entries_account_idx").on(
      table.accountId,
      table.createdAt,
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
    pricingKey: text("pricing_key"),
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
    index("subscriptions_pricing_key_idx").on(table.pricingKey),
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

export const platformOperators = sqliteTable(
  "platform_operators",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["platform_owner"] })
      .notNull()
      .default("platform_owner"),
    status: text("status", { enum: ["active", "suspended"] })
      .notNull()
      .default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "platform_operators_role_check",
      sql`${table.role} in ('platform_owner')`,
    ),
    check(
      "platform_operators_status_check",
      sql`${table.status} in ('active', 'suspended')`,
    ),
    index("platform_operators_status_idx").on(table.status),
  ],
);

export const callJobs = sqliteTable(
  "call_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recipientDataCiphertext: text("recipient_data_ciphertext").notNull(),
    recipientPhoneLast4: text("recipient_phone_last4").notNull(),
    status: text("status", {
      enum: [
        "scheduled",
        "queued",
        "in_progress",
        "completed",
        "review_required",
        "exhausted",
        "canceled",
      ],
    })
      .notNull()
      .default("scheduled"),
    outcome: text("outcome", {
      enum: [
        "confirmed",
        "declined",
        "reschedule_requested",
        "no_answer",
        "busy",
        "voicemail",
        "wrong_number",
        "do_not_call",
        "unclear",
        "technical_failure",
      ],
    }),
    maxAttempts: integer("max_attempts").notNull().default(3),
    attemptCount: integer("attempt_count").notNull().default(1),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "call_jobs_status_check",
      sql`${table.status} in ('scheduled', 'queued', 'in_progress', 'completed', 'review_required', 'exhausted', 'canceled')`,
    ),
    check(
      "call_jobs_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('confirmed', 'declined', 'reschedule_requested', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'do_not_call', 'unclear', 'technical_failure')`,
    ),
    check(
      "call_jobs_max_attempts_check",
      sql`${table.maxAttempts} between 1 and 5`,
    ),
    check(
      "call_jobs_attempt_count_check",
      sql`${table.attemptCount} between 1 and ${table.maxAttempts}`,
    ),
    check(
      "call_jobs_phone_last4_check",
      sql`length(${table.recipientPhoneLast4}) = 4`,
    ),
    index("call_jobs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("call_jobs_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const callAttempts = sqliteTable(
  "call_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => callJobs.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status", {
      enum: [
        "scheduled",
        "queued",
        "dispatching",
        "provider_queued",
        "ringing",
        "in_progress",
        "ended",
        "failed",
        "canceled",
      ],
    })
      .notNull()
      .default("scheduled"),
    providerCallId: text("provider_call_id"),
    outcome: text("outcome", {
      enum: [
        "confirmed",
        "declined",
        "reschedule_requested",
        "no_answer",
        "busy",
        "voicemail",
        "wrong_number",
        "do_not_call",
        "unclear",
        "technical_failure",
      ],
    }),
    recipientReached: integer("recipient_reached", { mode: "boolean" }),
    appointmentConfirmed: integer("appointment_confirmed", {
      mode: "boolean",
    }),
    followUpRequired: integer("follow_up_required", { mode: "boolean" }),
    resultCiphertext: text("result_ciphertext"),
    endedReason: text("ended_reason"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("call_attempts_job_number_uidx").on(
      table.jobId,
      table.attemptNumber,
    ),
    uniqueIndex("call_attempts_provider_call_uidx").on(table.providerCallId),
    check(
      "call_attempts_status_check",
      sql`${table.status} in ('scheduled', 'queued', 'dispatching', 'provider_queued', 'ringing', 'in_progress', 'ended', 'failed', 'canceled')`,
    ),
    check(
      "call_attempts_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('confirmed', 'declined', 'reschedule_requested', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'do_not_call', 'unclear', 'technical_failure')`,
    ),
    check(
      "call_attempts_number_check",
      sql`${table.attemptNumber} between 1 and 5`,
    ),
    index("call_attempts_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("call_attempts_status_scheduled_idx").on(
      table.status,
      table.scheduledAt,
    ),
    index("call_attempts_job_created_idx").on(table.jobId, table.createdAt),
  ],
);

/**
 * Live transcript lines for a call that is still on the phone. These rows are
 * deliberately short-lived: `finishCallAttempt` purges an attempt's lines as
 * soon as it records the outcome, and the minute cron sweeps anything an
 * end-of-call callback failed to close. Nothing transcript-shaped survives the
 * call, so the retained record stays the structured outcome plus summary.
 */
export const callTranscriptLines = sqliteTable(
  "call_transcript_lines",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => callAttempts.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => callJobs.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    speaker: text("speaker", { enum: ["agent", "recipient"] }).notNull(),
    textCiphertext: text("text_ciphertext").notNull(),
    /** Hash of speaker + text + provider timestamp; makes replays idempotent. */
    fingerprint: text("fingerprint").notNull(),
    spokenAt: integer("spoken_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("call_transcript_lines_attempt_fingerprint_uidx").on(
      table.attemptId,
      table.fingerprint,
    ),
    check(
      "call_transcript_lines_speaker_check",
      sql`${table.speaker} in ('agent', 'recipient')`,
    ),
    index("call_transcript_lines_attempt_spoken_idx").on(
      table.attemptId,
      table.spokenAt,
    ),
    index("call_transcript_lines_created_idx").on(table.createdAt),
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

export const imageUploads = sqliteTable(
  "image_uploads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider", { enum: ["s3", "r2"] })
      .notNull()
      .default("r2"),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    storedSizeBytes: integer("stored_size_bytes"),
    etag: text("etag"),
    versionId: text("version_id"),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("image_uploads_bucket_object_uidx").on(
      table.bucket,
      table.objectKey,
    ),
    index("image_uploads_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    check(
      "image_uploads_provider_check",
      sql`${table.provider} in ('s3', 'r2')`,
    ),
    check(
      "image_uploads_status_check",
      sql`${table.status} in ('pending', 'completed', 'failed')`,
    ),
    check(
      "image_uploads_declared_size_check",
      sql`${table.declaredSizeBytes} > 0`,
    ),
    check(
      "image_uploads_stored_size_check",
      sql`${table.storedSizeBytes} is null or ${table.storedSizeBytes} > 0`,
    ),
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

export const openchairAppointments = sqliteTable(
  "openchair_appointments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    clinicName: text("clinic_name").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    treatmentType: text("treatment_type").notNull(),
    currency: text("currency").notNull(),
    fullPrice: integer("full_price").notNull(),
    discountedPrice: integer("discounted_price").notNull(),
    sponsorAmount: integer("sponsor_amount").notNull(),
    patientAmount: integer("patient_amount").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", {
      enum: ["draft", "published", "canceled", "completed"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "openchair_appointments_status_check",
      sql`${table.status} in ('draft', 'published', 'canceled', 'completed')`,
    ),
    check(
      "openchair_appointments_duration_check",
      sql`${table.durationMinutes} between 5 and 480`,
    ),
    check(
      "openchair_appointments_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    check(
      "openchair_appointments_amounts_check",
      sql`${table.fullPrice} > 0 and ${table.discountedPrice} > 0 and ${table.sponsorAmount} >= 0 and ${table.patientAmount} >= 0 and ${table.discountedPrice} = ${table.sponsorAmount} + ${table.patientAmount} and ${table.fullPrice} >= ${table.discountedPrice}`,
    ),
    check(
      "openchair_appointments_version_check",
      sql`${table.version} > 0`,
    ),
    index("openchair_appointments_workspace_start_idx").on(
      table.workspaceId,
      table.startsAt,
    ),
    index("openchair_appointments_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt,
    ),
  ],
);

export const openchairAppointmentParticipants = sqliteTable(
  "openchair_appointment_participants",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationship: text("relationship", {
      enum: ["clinic", "nonprofit", "sponsor"],
    }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({
      name: "openchair_appointment_participants_pk",
      columns: [
        table.workspaceId,
        table.appointmentId,
        table.userId,
      ],
    }),
    check(
      "openchair_appointment_participants_relationship_check",
      sql`${table.relationship} in ('clinic', 'nonprofit', 'sponsor')`,
    ),
    index("openchair_appointment_participants_user_idx").on(
      table.workspaceId,
      table.userId,
      table.appointmentId,
    ),
  ],
);

export const openchairWorkflows = sqliteTable(
  "openchair_workflows",
  {
    appointmentId: text("appointment_id")
      .primaryKey()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    stage: text("stage", {
      enum: [
        "OPEN_SLOT",
        "PATIENT_SELECTION",
        "FUNDING_APPROVAL",
        "CALLING_PATIENTS",
        "PATIENT_ACCEPTED",
        "PAYMENT",
        "CHAIR_FILLED",
        "COMPLETED",
        "EXPIRED",
        "CANCELED",
        "FAILED",
      ],
    })
      .notNull()
      .default("OPEN_SLOT"),
    version: integer("version").notNull().default(1),
    sponsorPaid: integer("sponsor_paid", { mode: "boolean" })
      .notNull()
      .default(false),
    patientPaid: integer("patient_paid", { mode: "boolean" })
      .notNull()
      .default(false),
    reservedCandidateId: text("reserved_candidate_id"),
    terminalReason: text("terminal_reason", {
      enum: [
        "appointment_canceled",
        "appointment_expired",
        "candidate_pool_exhausted",
        "workflow_failed",
      ],
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "openchair_workflows_stage_check",
      sql`${table.stage} in ('OPEN_SLOT', 'PATIENT_SELECTION', 'FUNDING_APPROVAL', 'CALLING_PATIENTS', 'PATIENT_ACCEPTED', 'PAYMENT', 'CHAIR_FILLED', 'COMPLETED', 'EXPIRED', 'CANCELED', 'FAILED')`,
    ),
    check(
      "openchair_workflows_version_check",
      sql`${table.version} > 0`,
    ),
    check(
      "openchair_workflows_terminal_reason_check",
      sql`${table.terminalReason} is null or ${table.terminalReason} in ('appointment_canceled', 'appointment_expired', 'candidate_pool_exhausted', 'workflow_failed')`,
    ),
    index("openchair_workflows_workspace_stage_idx").on(
      table.workspaceId,
      table.stage,
      table.updatedAt,
    ),
  ],
);

export const openchairWorkflowHistory = sqliteTable(
  "openchair_workflow_history",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    workflowVersion: integer("workflow_version").notNull(),
    fromStage: text("from_stage").notNull(),
    toStage: text("to_stage").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    correlationId: text("correlation_id").notNull(),
    actorType: text("actor_type", {
      enum: ["user", "service", "system"],
    }).notNull(),
    actorId: text("actor_id"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("openchair_workflow_history_event_uidx").on(table.eventId),
    uniqueIndex("openchair_workflow_history_version_uidx").on(
      table.appointmentId,
      table.workflowVersion,
    ),
    check(
      "openchair_workflow_history_actor_check",
      sql`${table.actorType} in ('user', 'service', 'system')`,
    ),
    check(
      "openchair_workflow_history_version_check",
      sql`${table.workflowVersion} > 0`,
    ),
    index("openchair_workflow_history_workspace_appointment_idx").on(
      table.workspaceId,
      table.appointmentId,
      table.occurredAt,
    ),
  ],
);

export const openchairBeneficiaries = sqliteTable(
  "openchair_beneficiaries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    contactDataCiphertext: text("contact_data_ciphertext").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    preferredLanguage: text("preferred_language").notNull(),
    generalDentalNeed: text("general_dental_need").notNull(),
    availableToday: integer("available_today", { mode: "boolean" })
      .notNull()
      .default(false),
    contactConsent: integer("contact_consent", { mode: "boolean" })
      .notNull()
      .default(false),
    aiVoiceCallConsent: integer("ai_voice_call_consent", { mode: "boolean" })
      .notNull()
      .default(false),
    smsConsent: integer("sms_consent", { mode: "boolean" })
      .notNull()
      .default(false),
    clinicDataSharingConsent: integer("clinic_data_sharing_consent", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    verificationStatus: text("verification_status", {
      enum: ["pending", "verified", "rejected"],
    })
      .notNull()
      .default("pending"),
    status: text("status", {
      enum: ["active", "suspended", "archived"],
    })
      .notNull()
      .default("active"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "openchair_beneficiaries_phone_last4_check",
      sql`length(${table.phoneLast4}) = 4`,
    ),
    check(
      "openchair_beneficiaries_verification_check",
      sql`${table.verificationStatus} in ('pending', 'verified', 'rejected')`,
    ),
    check(
      "openchair_beneficiaries_status_check",
      sql`${table.status} in ('active', 'suspended', 'archived')`,
    ),
    index("openchair_beneficiaries_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.verificationStatus,
    ),
  ],
);

export const openchairCandidates = sqliteTable(
  "openchair_candidates",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    beneficiaryId: text("beneficiary_id")
      .notNull()
      .references(() => openchairBeneficiaries.id, { onDelete: "restrict" }),
    sequenceNumber: integer("sequence_number").notNull(),
    status: text("status", {
      enum: [
        "SELECTED",
        "QUEUED",
        "CALLING",
        "NO_ANSWER",
        "DECLINED",
        "ACCEPTED",
        "SKIPPED",
        "CANCELED",
      ],
    })
      .notNull()
      .default("SELECTED"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_candidates_appointment_beneficiary_uidx").on(
      table.appointmentId,
      table.beneficiaryId,
    ),
    uniqueIndex("openchair_candidates_appointment_sequence_uidx").on(
      table.appointmentId,
      table.sequenceNumber,
    ),
    check(
      "openchair_candidates_sequence_check",
      sql`${table.sequenceNumber} > 0`,
    ),
    check(
      "openchair_candidates_status_check",
      sql`${table.status} in ('SELECTED', 'QUEUED', 'CALLING', 'NO_ANSWER', 'DECLINED', 'ACCEPTED', 'SKIPPED', 'CANCELED')`,
    ),
    index("openchair_candidates_workspace_appointment_idx").on(
      table.workspaceId,
      table.appointmentId,
      table.status,
    ),
  ],
);

export const openchairAppointmentSponsors = sqliteTable(
  "openchair_appointment_sponsors",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["ACTIVE", "REVOKED"] })
      .notNull()
      .default("ACTIVE"),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_appointment_sponsors_appointment_user_uidx").on(
      table.appointmentId,
      table.userId,
    ),
    check(
      "openchair_appointment_sponsors_status_check",
      sql`${table.status} in ('ACTIVE', 'REVOKED')`,
    ),
    index("openchair_appointment_sponsors_workspace_appointment_idx").on(
      table.workspaceId,
      table.appointmentId,
      table.status,
    ),
  ],
);

export const openchairFundingRequests = sqliteTable(
  "openchair_funding_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    totalAmount: integer("total_amount").notNull(),
    sponsorAmount: integer("sponsor_amount").notNull(),
    patientAmount: integer("patient_amount").notNull(),
    status: text("status", {
      enum: [
        "PENDING",
        "APPROVED",
        "SPONSOR_PAID",
        "DECLINED",
        "EXPIRED",
        "REFUNDED",
      ],
    })
      .notNull()
      .default("PENDING"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_funding_requests_appointment_uidx").on(
      table.appointmentId,
    ),
    check(
      "openchair_funding_requests_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    check(
      "openchair_funding_requests_amounts_check",
      sql`${table.totalAmount} > 0 and ${table.sponsorAmount} >= 0 and ${table.patientAmount} >= 0 and ${table.totalAmount} = ${table.sponsorAmount} + ${table.patientAmount}`,
    ),
    check(
      "openchair_funding_requests_status_check",
      sql`${table.status} in ('PENDING', 'APPROVED', 'SPONSOR_PAID', 'DECLINED', 'EXPIRED', 'REFUNDED')`,
    ),
    check(
      "openchair_funding_requests_version_check",
      sql`${table.version} > 0`,
    ),
    index("openchair_funding_requests_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt,
    ),
  ],
);

export const openchairPayments = sqliteTable(
  "openchair_payments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    fundingRequestId: text("funding_request_id")
      .notNull()
      .references(() => openchairFundingRequests.id, { onDelete: "restrict" }),
    payerType: text("payer_type", {
      enum: ["sponsor", "patient"],
    }).notNull(),
    beneficiaryId: text("beneficiary_id").references(
      () => openchairBeneficiaries.id,
      { onDelete: "restrict" },
    ),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status", {
      enum: [
        "PENDING",
        "CHECKOUT_CREATED",
        "PAID",
        "FAILED",
        "EXPIRED",
        "REFUNDED",
      ],
    })
      .notNull()
      .default("PENDING"),
    provider: text("provider", { enum: ["stripe"] })
      .notNull()
      .default("stripe"),
    providerCheckoutSessionId: text("provider_checkout_session_id"),
    providerPaymentId: text("provider_payment_id"),
    providerRefundId: text("provider_refund_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    refundedAt: integer("refunded_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_payments_appointment_payer_uidx").on(
      table.appointmentId,
      table.payerType,
    ),
    uniqueIndex("openchair_payments_workspace_idempotency_uidx").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("openchair_payments_checkout_uidx").on(
      table.providerCheckoutSessionId,
    ),
    uniqueIndex("openchair_payments_provider_payment_uidx").on(
      table.providerPaymentId,
    ),
    check(
      "openchair_payments_payer_check",
      sql`${table.payerType} in ('sponsor', 'patient')`,
    ),
    check(
      "openchair_payments_status_check",
      sql`${table.status} in ('PENDING', 'CHECKOUT_CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED')`,
    ),
    check(
      "openchair_payments_provider_check",
      sql`${table.provider} in ('stripe')`,
    ),
    check("openchair_payments_amount_check", sql`${table.amount} > 0`),
    check(
      "openchair_payments_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    index("openchair_payments_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt,
    ),
  ],
);

export const openchairPaymentAttempts = sqliteTable(
  "openchair_payment_attempts",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => openchairPayments.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    providerCheckoutSessionId: text("provider_checkout_session_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["CREATING", "OPEN", "COMPLETED", "FAILED", "EXPIRED"],
    })
      .notNull()
      .default("CREATING"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_payment_attempts_idempotency_uidx").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("openchair_payment_attempts_checkout_uidx").on(
      table.providerCheckoutSessionId,
    ),
    check(
      "openchair_payment_attempts_status_check",
      sql`${table.status} in ('CREATING', 'OPEN', 'COMPLETED', 'FAILED', 'EXPIRED')`,
    ),
    index("openchair_payment_attempts_payment_idx").on(
      table.paymentId,
      table.createdAt,
    ),
  ],
);

/**
 * Appointment-funding cash journal. Rows are append-only: refunds are new
 * entries and no application repository exposes update/delete operations.
 */
export const openchairFundingLedgerEntries = sqliteTable(
  "openchair_funding_ledger_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "restrict" }),
    paymentId: text("payment_id")
      .notNull()
      .references(() => openchairPayments.id, { onDelete: "restrict" }),
    entryType: text("entry_type", {
      enum: ["PAYMENT_RECEIVED", "REFUND_ISSUED"],
    }).notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerRefundId: text("provider_refund_id"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("openchair_funding_ledger_provider_event_uidx").on(
      table.providerEventId,
    ),
    check(
      "openchair_funding_ledger_entry_type_check",
      sql`${table.entryType} in ('PAYMENT_RECEIVED', 'REFUND_ISSUED')`,
    ),
    check(
      "openchair_funding_ledger_amount_check",
      sql`${table.amount} > 0`,
    ),
    check(
      "openchair_funding_ledger_currency_check",
      sql`length(${table.currency}) = 3`,
    ),
    index("openchair_funding_ledger_appointment_idx").on(
      table.workspaceId,
      table.appointmentId,
      table.occurredAt,
    ),
  ],
);

export const openchairOutreachRuns = sqliteTable(
  "openchair_outreach_runs",
  {
    appointmentId: text("appointment_id")
      .primaryKey()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: [
        "PENDING",
        "REQUESTED",
        "ACTIVE",
        "STOPPED",
        "EXHAUSTED",
        "FAILED",
      ],
    })
      .notNull()
      .default("PENDING"),
    currentCandidateId: text("current_candidate_id"),
    version: integer("version").notNull().default(1),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    stoppedAt: integer("stopped_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "openchair_outreach_runs_status_check",
      sql`${table.status} in ('PENDING', 'REQUESTED', 'ACTIVE', 'STOPPED', 'EXHAUSTED', 'FAILED')`,
    ),
    check(
      "openchair_outreach_runs_version_check",
      sql`${table.version} > 0`,
    ),
    index("openchair_outreach_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const openchairOutreachAttempts = sqliteTable(
  "openchair_outreach_attempts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => openchairAppointments.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => openchairCandidates.id, { onDelete: "restrict" }),
    callJobId: text("call_job_id").references(() => callJobs.id, {
      onDelete: "set null",
    }),
    callAttemptId: text("call_attempt_id").references(() => callAttempts.id, {
      onDelete: "set null",
    }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: text("status", {
      enum: [
        "QUEUED",
        "CALLING",
        "ENDED",
        "FAILED",
        "CANCELED",
      ],
    })
      .notNull()
      .default("QUEUED"),
    outcome: text("outcome", {
      enum: [
        "ACCEPTED",
        "DECLINED",
        "NO_ANSWER",
        "VOICEMAIL",
        "BUSY",
        "WRONG_NUMBER",
        "CALL_FAILED",
        "HUMAN_REVIEW",
      ],
    }),
    providerCallId: text("provider_call_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_outreach_attempt_candidate_number_uidx").on(
      table.candidateId,
      table.attemptNumber,
    ),
    uniqueIndex("openchair_outreach_attempt_call_attempt_uidx").on(
      table.callAttemptId,
    ),
    uniqueIndex("openchair_outreach_attempt_provider_call_uidx").on(
      table.providerCallId,
    ),
    check(
      "openchair_outreach_attempt_status_check",
      sql`${table.status} in ('QUEUED', 'CALLING', 'ENDED', 'FAILED', 'CANCELED')`,
    ),
    check(
      "openchair_outreach_attempt_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('ACCEPTED', 'DECLINED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'WRONG_NUMBER', 'CALL_FAILED', 'HUMAN_REVIEW')`,
    ),
    check(
      "openchair_outreach_attempt_number_check",
      sql`${table.attemptNumber} between 1 and 5`,
    ),
    index("openchair_outreach_attempt_workspace_appointment_idx").on(
      table.workspaceId,
      table.appointmentId,
      table.status,
    ),
  ],
);

export const openchairCommandReceipts = sqliteTable(
  "openchair_command_receipts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    aggregateType: text("aggregate_type", {
      enum: ["appointment"],
    }).notNull(),
    aggregateId: text("aggregate_id").notNull(),
    commandType: text("command_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    resultVersion: integer("result_version"),
    status: text("status", {
      enum: ["processing", "completed", "failed"],
    })
      .notNull()
      .default("processing"),
    correlationId: text("correlation_id").notNull(),
    actorType: text("actor_type", {
      enum: ["user", "service", "system"],
    }).notNull(),
    actorId: text("actor_id"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("openchair_command_receipts_idempotency_uidx").on(
      table.workspaceId,
      table.aggregateType,
      table.aggregateId,
      table.idempotencyKey,
    ),
    check(
      "openchair_command_receipts_aggregate_check",
      sql`${table.aggregateType} in ('appointment')`,
    ),
    check(
      "openchair_command_receipts_status_check",
      sql`${table.status} in ('processing', 'completed', 'failed')`,
    ),
    check(
      "openchair_command_receipts_actor_check",
      sql`${table.actorType} in ('user', 'service', 'system')`,
    ),
    check(
      "openchair_command_receipts_expected_version_check",
      sql`${table.expectedVersion} > 0`,
    ),
    index("openchair_command_receipts_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipPermissionOverride =
  typeof membershipPermissionOverrides.$inferSelect;
export type ParticipantRole = typeof participantRoles.$inferSelect;
export type FundingPool = typeof fundingPools.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type ServiceProviderAccount =
  typeof serviceProviderAccounts.$inferSelect;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type FinancialLedgerEntry = typeof financialLedgerEntries.$inferSelect;
export type BillingAccount = typeof billingAccounts.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type PlatformOperator = typeof platformOperators.$inferSelect;
export type CallJob = typeof callJobs.$inferSelect;
export type CallAttempt = typeof callAttempts.$inferSelect;
export type ProviderInboxEvent = typeof providerInboxEvents.$inferSelect;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type ImageUpload = typeof imageUploads.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type OpenChairAppointment = typeof openchairAppointments.$inferSelect;
export type OpenChairWorkflow = typeof openchairWorkflows.$inferSelect;
export type OpenChairWorkflowHistoryEntry =
  typeof openchairWorkflowHistory.$inferSelect;
export type OpenChairBeneficiary = typeof openchairBeneficiaries.$inferSelect;
export type OpenChairCandidate = typeof openchairCandidates.$inferSelect;
export type OpenChairFundingRequest =
  typeof openchairFundingRequests.$inferSelect;
export type OpenChairPayment = typeof openchairPayments.$inferSelect;
export type OpenChairPaymentAttempt =
  typeof openchairPaymentAttempts.$inferSelect;
export type OpenChairFundingLedgerEntry =
  typeof openchairFundingLedgerEntries.$inferSelect;
export type OpenChairOutreachRun = typeof openchairOutreachRuns.$inferSelect;
export type OpenChairOutreachAttempt =
  typeof openchairOutreachAttempts.$inferSelect;
export type OpenChairCommandReceipt =
  typeof openchairCommandReceipts.$inferSelect;
