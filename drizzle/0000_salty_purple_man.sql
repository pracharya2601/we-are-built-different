CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`request_id` text,
	`ip_address` text,
	`metadata` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_log_actor_type_check" CHECK("audit_log"."actor_type" in ('user', 'service', 'system'))
);
--> statement-breakpoint
CREATE INDEX `audit_log_workspace_occurred_idx` ON `audit_log` (`workspace_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_occurred_idx` ON `audit_log` (`actor_type`,`actor_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_action_occurred_idx` ON `audit_log` (`action`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `billing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_customer_id` text NOT NULL,
	`billing_email` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "billing_accounts_provider_check" CHECK("billing_accounts"."provider" in ('stripe'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_workspace_uidx` ON `billing_accounts` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_provider_customer_uidx` ON `billing_accounts` (`provider`,`provider_customer_id`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`access_state` text DEFAULT 'inactive' NOT NULL,
	`source_subscription_id` text,
	`valid_until` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entitlements_access_state_check" CHECK("entitlements"."access_state" in ('active', 'trialing', 'grace', 'inactive')),
	CONSTRAINT "entitlements_revision_check" CHECK("entitlements"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `entitlements_workspace_access_idx` ON `entitlements` (`workspace_id`,`access_state`);--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identities_issuer_subject_uidx` ON `identities` (`issuer`,`subject`);--> statement-breakpoint
CREATE INDEX `identities_user_id_idx` ON `identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by_user_id` text,
	`joined_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "memberships_role_check" CHECK("memberships"."role" in ('owner', 'admin', 'billing_admin', 'member')),
	CONSTRAINT "memberships_status_check" CHECK("memberships"."status" in ('invited', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE INDEX `memberships_user_status_idx` ON `memberships` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `memberships_workspace_status_idx` ON `memberships` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`locked_until` integer,
	`published_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "outbox_state_check" CHECK("outbox_events"."state" in ('pending', 'processing', 'published', 'failed')),
	CONSTRAINT "outbox_schema_version_check" CHECK("outbox_events"."schema_version" > 0),
	CONSTRAINT "outbox_attempts_check" CHECK("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `outbox_state_available_idx` ON `outbox_events` (`state`,`available_at`);--> statement-breakpoint
CREATE INDEX `outbox_aggregate_idx` ON `outbox_events` (`aggregate_type`,`aggregate_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_inbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'processing' NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`last_error` text,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "provider_inbox_state_check" CHECK("provider_inbox_events"."state" in ('processing', 'completed', 'failed')),
	CONSTRAINT "provider_inbox_attempts_check" CHECK("provider_inbox_events"."attempts" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_inbox_provider_event_uidx` ON `provider_inbox_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `provider_inbox_state_received_idx` ON `provider_inbox_events` (`state`,`received_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`provider_subscription_id` text NOT NULL,
	`provider_price_id` text,
	`status` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`trial_ends_at` integer,
	`canceled_at` integer,
	`provider_updated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`billing_account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "subscriptions_status_check" CHECK("subscriptions"."status" in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_subscription_uidx` ON `subscriptions` (`provider_subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_billing_account_status_idx` ON `subscriptions` (`billing_account_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`primary_email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "users_status_check" CHECK("users"."status" in ('active', 'disabled', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`auth0_organization_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "workspaces_status_check" CHECK("workspaces"."status" in ('active', 'suspended', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_uidx` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_auth0_organization_id_uidx` ON `workspaces` (`auth0_organization_id`);