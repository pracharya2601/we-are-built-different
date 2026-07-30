CREATE TABLE `openchair_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`clinic_name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`treatment_type` text NOT NULL,
	`currency` text NOT NULL,
	`full_price` integer NOT NULL,
	`discounted_price` integer NOT NULL,
	`sponsor_amount` integer NOT NULL,
	`patient_amount` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_appointments_status_check" CHECK("openchair_appointments"."status" in ('draft', 'published', 'canceled', 'completed')),
	CONSTRAINT "openchair_appointments_duration_check" CHECK("openchair_appointments"."duration_minutes" between 5 and 480),
	CONSTRAINT "openchair_appointments_currency_check" CHECK(length("openchair_appointments"."currency") = 3),
	CONSTRAINT "openchair_appointments_amounts_check" CHECK("openchair_appointments"."full_price" > 0 and "openchair_appointments"."discounted_price" > 0 and "openchair_appointments"."sponsor_amount" >= 0 and "openchair_appointments"."patient_amount" >= 0 and "openchair_appointments"."discounted_price" = "openchair_appointments"."sponsor_amount" + "openchair_appointments"."patient_amount" and "openchair_appointments"."full_price" >= "openchair_appointments"."discounted_price"),
	CONSTRAINT "openchair_appointments_version_check" CHECK("openchair_appointments"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `openchair_appointments_workspace_start_idx` ON `openchair_appointments` (`workspace_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `openchair_appointments_workspace_status_idx` ON `openchair_appointments` (`workspace_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `openchair_beneficiaries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`contact_data_ciphertext` text NOT NULL,
	`phone_last4` text NOT NULL,
	`preferred_language` text NOT NULL,
	`general_dental_need` text NOT NULL,
	`available_today` integer DEFAULT false NOT NULL,
	`contact_consent` integer DEFAULT false NOT NULL,
	`ai_voice_call_consent` integer DEFAULT false NOT NULL,
	`sms_consent` integer DEFAULT false NOT NULL,
	`clinic_data_sharing_consent` integer DEFAULT false NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_beneficiaries_phone_last4_check" CHECK(length("openchair_beneficiaries"."phone_last4") = 4),
	CONSTRAINT "openchair_beneficiaries_verification_check" CHECK("openchair_beneficiaries"."verification_status" in ('pending', 'verified', 'rejected')),
	CONSTRAINT "openchair_beneficiaries_status_check" CHECK("openchair_beneficiaries"."status" in ('active', 'suspended', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `openchair_beneficiaries_workspace_status_idx` ON `openchair_beneficiaries` (`workspace_id`,`status`,`verification_status`);--> statement-breakpoint
CREATE TABLE `openchair_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`beneficiary_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`status` text DEFAULT 'SELECTED' NOT NULL,
	`approved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`beneficiary_id`) REFERENCES `openchair_beneficiaries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_candidates_sequence_check" CHECK("openchair_candidates"."sequence_number" > 0),
	CONSTRAINT "openchair_candidates_status_check" CHECK("openchair_candidates"."status" in ('SELECTED', 'QUEUED', 'CALLING', 'NO_ANSWER', 'DECLINED', 'ACCEPTED', 'SKIPPED', 'CANCELED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_candidates_appointment_beneficiary_uidx` ON `openchair_candidates` (`appointment_id`,`beneficiary_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_candidates_appointment_sequence_uidx` ON `openchair_candidates` (`appointment_id`,`sequence_number`);--> statement-breakpoint
CREATE INDEX `openchair_candidates_workspace_appointment_idx` ON `openchair_candidates` (`workspace_id`,`appointment_id`,`status`);--> statement-breakpoint
CREATE TABLE `openchair_command_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`command_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`expected_version` integer NOT NULL,
	`result_version` integer,
	`status` text DEFAULT 'processing' NOT NULL,
	`correlation_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_command_receipts_aggregate_check" CHECK("openchair_command_receipts"."aggregate_type" in ('appointment')),
	CONSTRAINT "openchair_command_receipts_status_check" CHECK("openchair_command_receipts"."status" in ('processing', 'completed', 'failed')),
	CONSTRAINT "openchair_command_receipts_actor_check" CHECK("openchair_command_receipts"."actor_type" in ('user', 'service', 'system')),
	CONSTRAINT "openchair_command_receipts_expected_version_check" CHECK("openchair_command_receipts"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_command_receipts_idempotency_uidx` ON `openchair_command_receipts` (`workspace_id`,`aggregate_type`,`aggregate_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `openchair_command_receipts_workspace_status_idx` ON `openchair_command_receipts` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `openchair_funding_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`currency` text NOT NULL,
	`total_amount` integer NOT NULL,
	`sponsor_amount` integer NOT NULL,
	`patient_amount` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "openchair_funding_requests_currency_check" CHECK(length("openchair_funding_requests"."currency") = 3),
	CONSTRAINT "openchair_funding_requests_amounts_check" CHECK("openchair_funding_requests"."total_amount" > 0 and "openchair_funding_requests"."sponsor_amount" >= 0 and "openchair_funding_requests"."patient_amount" >= 0 and "openchair_funding_requests"."total_amount" = "openchair_funding_requests"."sponsor_amount" + "openchair_funding_requests"."patient_amount"),
	CONSTRAINT "openchair_funding_requests_status_check" CHECK("openchair_funding_requests"."status" in ('PENDING', 'APPROVED', 'SPONSOR_PAID', 'DECLINED', 'EXPIRED', 'REFUNDED')),
	CONSTRAINT "openchair_funding_requests_version_check" CHECK("openchair_funding_requests"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_funding_requests_appointment_uidx` ON `openchair_funding_requests` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `openchair_funding_requests_workspace_status_idx` ON `openchair_funding_requests` (`workspace_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `openchair_outreach_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`call_job_id` text,
	`call_attempt_id` text,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`outcome` text,
	`provider_call_id` text,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `openchair_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`call_job_id`) REFERENCES `call_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`call_attempt_id`) REFERENCES `call_attempts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "openchair_outreach_attempt_status_check" CHECK("openchair_outreach_attempts"."status" in ('QUEUED', 'CALLING', 'ENDED', 'FAILED', 'CANCELED')),
	CONSTRAINT "openchair_outreach_attempt_outcome_check" CHECK("openchair_outreach_attempts"."outcome" is null or "openchair_outreach_attempts"."outcome" in ('ACCEPTED', 'DECLINED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'WRONG_NUMBER', 'CALL_FAILED', 'HUMAN_REVIEW')),
	CONSTRAINT "openchair_outreach_attempt_number_check" CHECK("openchair_outreach_attempts"."attempt_number" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_outreach_attempt_candidate_number_uidx` ON `openchair_outreach_attempts` (`candidate_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_outreach_attempt_call_attempt_uidx` ON `openchair_outreach_attempts` (`call_attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_outreach_attempt_provider_call_uidx` ON `openchair_outreach_attempts` (`provider_call_id`);--> statement-breakpoint
CREATE INDEX `openchair_outreach_attempt_workspace_appointment_idx` ON `openchair_outreach_attempts` (`workspace_id`,`appointment_id`,`status`);--> statement-breakpoint
CREATE TABLE `openchair_outreach_runs` (
	`appointment_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`current_candidate_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`started_at` integer,
	`stopped_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_outreach_runs_status_check" CHECK("openchair_outreach_runs"."status" in ('PENDING', 'REQUESTED', 'ACTIVE', 'STOPPED', 'EXHAUSTED', 'FAILED')),
	CONSTRAINT "openchair_outreach_runs_version_check" CHECK("openchair_outreach_runs"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `openchair_outreach_runs_workspace_status_idx` ON `openchair_outreach_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `openchair_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`funding_request_id` text NOT NULL,
	`payer_type` text NOT NULL,
	`beneficiary_id` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_checkout_session_id` text,
	`provider_payment_id` text,
	`provider_refund_id` text,
	`idempotency_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`paid_at` integer,
	`refunded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`funding_request_id`) REFERENCES `openchair_funding_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiary_id`) REFERENCES `openchair_beneficiaries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_payments_payer_check" CHECK("openchair_payments"."payer_type" in ('sponsor', 'patient')),
	CONSTRAINT "openchair_payments_status_check" CHECK("openchair_payments"."status" in ('PENDING', 'CHECKOUT_CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED')),
	CONSTRAINT "openchair_payments_provider_check" CHECK("openchair_payments"."provider" in ('stripe')),
	CONSTRAINT "openchair_payments_amount_check" CHECK("openchair_payments"."amount" > 0),
	CONSTRAINT "openchair_payments_currency_check" CHECK(length("openchair_payments"."currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payments_appointment_payer_uidx` ON `openchair_payments` (`appointment_id`,`payer_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payments_workspace_idempotency_uidx` ON `openchair_payments` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payments_checkout_uidx` ON `openchair_payments` (`provider_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_payments_provider_payment_uidx` ON `openchair_payments` (`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `openchair_payments_workspace_status_idx` ON `openchair_payments` (`workspace_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `openchair_workflow_history` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`workflow_version` integer NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`correlation_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "openchair_workflow_history_actor_check" CHECK("openchair_workflow_history"."actor_type" in ('user', 'service', 'system')),
	CONSTRAINT "openchair_workflow_history_version_check" CHECK("openchair_workflow_history"."workflow_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_workflow_history_event_uidx` ON `openchair_workflow_history` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_workflow_history_version_uidx` ON `openchair_workflow_history` (`appointment_id`,`workflow_version`);--> statement-breakpoint
CREATE INDEX `openchair_workflow_history_workspace_appointment_idx` ON `openchair_workflow_history` (`workspace_id`,`appointment_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `openchair_workflows` (
	`appointment_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`stage` text DEFAULT 'OPEN_SLOT' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`sponsor_paid` integer DEFAULT false NOT NULL,
	`patient_paid` integer DEFAULT false NOT NULL,
	`reserved_candidate_id` text,
	`terminal_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_workflows_stage_check" CHECK("openchair_workflows"."stage" in ('OPEN_SLOT', 'PATIENT_SELECTION', 'FUNDING_APPROVAL', 'CALLING_PATIENTS', 'PATIENT_ACCEPTED', 'PAYMENT', 'CHAIR_FILLED', 'COMPLETED', 'EXPIRED', 'CANCELED', 'FAILED')),
	CONSTRAINT "openchair_workflows_version_check" CHECK("openchair_workflows"."version" > 0),
	CONSTRAINT "openchair_workflows_terminal_reason_check" CHECK("openchair_workflows"."terminal_reason" is null or "openchair_workflows"."terminal_reason" in ('appointment_canceled', 'appointment_expired', 'candidate_pool_exhausted', 'workflow_failed'))
);
--> statement-breakpoint
CREATE INDEX `openchair_workflows_workspace_stage_idx` ON `openchair_workflows` (`workspace_id`,`stage`,`updated_at`);