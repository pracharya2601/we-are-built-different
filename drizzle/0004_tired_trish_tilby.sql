CREATE TABLE `membership_permission_overrides` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`effect` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `permission`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "membership_permission_overrides_effect_check" CHECK("membership_permission_overrides"."effect" in ('allow', 'deny'))
);
--> statement-breakpoint
CREATE INDEX `membership_permission_overrides_member_idx` ON `membership_permission_overrides` (`workspace_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `account_type` text DEFAULT 'beneficiary' NOT NULL CONSTRAINT "workspaces_account_type_check" CHECK(`account_type` in ('service_provider', 'nonprofit', 'beneficiary'));--> statement-breakpoint
UPDATE `workspaces` SET `account_type` = CASE WHEN `workspace_type` = 'team' THEN 'nonprofit' ELSE 'beneficiary' END;--> statement-breakpoint
CREATE INDEX `workspaces_account_type_status_idx` ON `workspaces` (`account_type`,`status`);
