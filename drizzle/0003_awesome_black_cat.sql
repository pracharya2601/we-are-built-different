CREATE TABLE `financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pool_id` text NOT NULL,
	`key` text NOT NULL,
	`account_type` text NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pool_id`) REFERENCES `funding_pools`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_accounts_type_check" CHECK("financial_accounts"."account_type" in ('asset', 'liability', 'revenue', 'expense', 'equity')),
	CONSTRAINT "financial_accounts_status_check" CHECK("financial_accounts"."status" in ('active', 'closed')),
	CONSTRAINT "financial_accounts_currency_check" CHECK(length("financial_accounts"."currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_accounts_pool_key_uidx` ON `financial_accounts` (`pool_id`,`key`);--> statement-breakpoint
CREATE INDEX `financial_accounts_workspace_idx` ON `financial_accounts` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `financial_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `financial_transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_ledger_entries_direction_check" CHECK("financial_ledger_entries"."direction" in ('debit', 'credit')),
	CONSTRAINT "financial_ledger_entries_amount_check" CHECK("financial_ledger_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `financial_ledger_entries_transaction_idx` ON `financial_ledger_entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `financial_ledger_entries_account_idx` ON `financial_ledger_entries` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pool_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`benefactor_user_id` text,
	`beneficiary_user_id` text,
	`service_provider_user_id` text,
	`provider` text,
	`provider_payment_id` text,
	`provider_transfer_id` text,
	`idempotency_key` text NOT NULL,
	`memo` text,
	`occurred_at` integer NOT NULL,
	`posted_at` integer,
	`reversed_transaction_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pool_id`) REFERENCES `funding_pools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`benefactor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiary_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_provider_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_transactions_kind_check" CHECK("financial_transactions"."kind" in ('benefactor_deposit', 'beneficiary_allocation', 'service_provider_payment', 'refund', 'adjustment')),
	CONSTRAINT "financial_transactions_status_check" CHECK("financial_transactions"."status" in ('pending', 'posted', 'failed', 'reversed')),
	CONSTRAINT "financial_transactions_amount_check" CHECK("financial_transactions"."amount" > 0),
	CONSTRAINT "financial_transactions_currency_check" CHECK(length("financial_transactions"."currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_workspace_idempotency_uidx` ON `financial_transactions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_provider_payment_uidx` ON `financial_transactions` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_provider_transfer_uidx` ON `financial_transactions` (`provider`,`provider_transfer_id`);--> statement-breakpoint
CREATE INDEX `financial_transactions_pool_occurred_idx` ON `financial_transactions` (`pool_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `financial_transactions_benefactor_idx` ON `financial_transactions` (`benefactor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `financial_transactions_beneficiary_idx` ON `financial_transactions` (`beneficiary_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `financial_transactions_service_provider_idx` ON `financial_transactions` (`service_provider_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `funding_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "funding_pools_currency_check" CHECK(length("funding_pools"."currency") = 3),
	CONSTRAINT "funding_pools_status_check" CHECK("funding_pools"."status" in ('open', 'frozen', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `funding_pools_workspace_status_idx` ON `funding_pools` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `participant_roles` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `role`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "participant_roles_role_check" CHECK("participant_roles"."role" in ('service_provider', 'benefactor', 'beneficiary')),
	CONSTRAINT "participant_roles_status_check" CHECK("participant_roles"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE INDEX `participant_roles_workspace_role_idx` ON `participant_roles` (`workspace_id`,`role`,`status`);--> statement-breakpoint
CREATE INDEX `participant_roles_user_idx` ON `participant_roles` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_provider_accounts` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_account_id` text NOT NULL,
	`onboarding_status` text DEFAULT 'pending' NOT NULL,
	`charges_enabled` integer DEFAULT false NOT NULL,
	`payouts_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "service_provider_accounts_provider_check" CHECK("service_provider_accounts"."provider" in ('stripe')),
	CONSTRAINT "service_provider_accounts_status_check" CHECK("service_provider_accounts"."onboarding_status" in ('pending', 'restricted', 'enabled', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_provider_accounts_provider_uidx` ON `service_provider_accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `service_provider_accounts_workspace_status_idx` ON `service_provider_accounts` (`workspace_id`,`onboarding_status`);