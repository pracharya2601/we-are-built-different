CREATE TABLE `openchair_payment_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `payment_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `provider_checkout_session_id` text,
  `idempotency_key` text NOT NULL,
  `status` text DEFAULT 'CREATING' NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`payment_id`) REFERENCES `openchair_payments`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "openchair_payment_attempts_status_check" CHECK(`status` in ('CREATING', 'OPEN', 'COMPLETED', 'FAILED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payment_attempts_idempotency_uidx` ON `openchair_payment_attempts` (`workspace_id`,`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payment_attempts_checkout_uidx` ON `openchair_payment_attempts` (`provider_checkout_session_id`);
--> statement-breakpoint
CREATE INDEX `openchair_payment_attempts_payment_idx` ON `openchair_payment_attempts` (`payment_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `openchair_funding_ledger_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `appointment_id` text NOT NULL,
  `payment_id` text NOT NULL,
  `entry_type` text NOT NULL,
  `amount` integer NOT NULL,
  `currency` text NOT NULL,
  `provider_event_id` text NOT NULL,
  `provider_payment_id` text,
  `provider_refund_id` text,
  `occurred_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`payment_id`) REFERENCES `openchair_payments`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "openchair_funding_ledger_entry_type_check" CHECK(`entry_type` in ('PAYMENT_RECEIVED', 'REFUND_ISSUED')),
  CONSTRAINT "openchair_funding_ledger_amount_check" CHECK(`amount` > 0),
  CONSTRAINT "openchair_funding_ledger_currency_check" CHECK(length(`currency`) = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_funding_ledger_provider_event_uidx` ON `openchair_funding_ledger_entries` (`provider_event_id`);
--> statement-breakpoint
CREATE INDEX `openchair_funding_ledger_appointment_idx` ON `openchair_funding_ledger_entries` (`workspace_id`,`appointment_id`,`occurred_at`);
