CREATE TABLE `openchair_appointment_sponsors` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "openchair_appointment_sponsors_status_check" CHECK("openchair_appointment_sponsors"."status" in ('ACTIVE', 'REVOKED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `openchair_appointment_sponsors_appointment_user_uidx` ON `openchair_appointment_sponsors` (`appointment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `openchair_appointment_sponsors_workspace_appointment_idx` ON `openchair_appointment_sponsors` (`workspace_id`,`appointment_id`,`status`);
