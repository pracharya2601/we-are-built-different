CREATE TABLE `call_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`provider_call_id` text,
	`outcome` text,
	`recipient_reached` integer,
	`appointment_confirmed` integer,
	`follow_up_required` integer,
	`result_ciphertext` text,
	`ended_reason` text,
	`failure_code` text,
	`failure_message` text,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `call_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "call_attempts_status_check" CHECK("call_attempts"."status" in ('scheduled', 'queued', 'dispatching', 'provider_queued', 'ringing', 'in_progress', 'ended', 'failed', 'canceled')),
	CONSTRAINT "call_attempts_outcome_check" CHECK("call_attempts"."outcome" is null or "call_attempts"."outcome" in ('confirmed', 'declined', 'reschedule_requested', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'do_not_call', 'unclear', 'technical_failure')),
	CONSTRAINT "call_attempts_number_check" CHECK("call_attempts"."attempt_number" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_attempts_job_number_uidx` ON `call_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `call_attempts_provider_call_uidx` ON `call_attempts` (`provider_call_id`);--> statement-breakpoint
CREATE INDEX `call_attempts_workspace_created_idx` ON `call_attempts` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `call_attempts_status_scheduled_idx` ON `call_attempts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `call_attempts_job_created_idx` ON `call_attempts` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `call_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`recipient_data_ciphertext` text NOT NULL,
	`recipient_phone_last4` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`outcome` text,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`next_attempt_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "call_jobs_status_check" CHECK("call_jobs"."status" in ('scheduled', 'queued', 'in_progress', 'completed', 'review_required', 'exhausted', 'canceled')),
	CONSTRAINT "call_jobs_outcome_check" CHECK("call_jobs"."outcome" is null or "call_jobs"."outcome" in ('confirmed', 'declined', 'reschedule_requested', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'do_not_call', 'unclear', 'technical_failure')),
	CONSTRAINT "call_jobs_max_attempts_check" CHECK("call_jobs"."max_attempts" between 1 and 5),
	CONSTRAINT "call_jobs_attempt_count_check" CHECK("call_jobs"."attempt_count" between 1 and "call_jobs"."max_attempts"),
	CONSTRAINT "call_jobs_phone_last4_check" CHECK(length("call_jobs"."recipient_phone_last4") = 4)
);
--> statement-breakpoint
CREATE INDEX `call_jobs_workspace_created_idx` ON `call_jobs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `call_jobs_status_next_attempt_idx` ON `call_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `platform_operators` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'platform_owner' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "platform_operators_role_check" CHECK("platform_operators"."role" in ('platform_owner')),
	CONSTRAINT "platform_operators_status_check" CHECK("platform_operators"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE INDEX `platform_operators_status_idx` ON `platform_operators` (`status`);