CREATE TABLE `openchair_appointment_participants` (
  `workspace_id` text NOT NULL,
  `appointment_id` text NOT NULL,
  `user_id` text NOT NULL,
  `relationship` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  PRIMARY KEY (`workspace_id`, `appointment_id`, `user_id`),
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`appointment_id`) REFERENCES `openchair_appointments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "openchair_appointment_participants_relationship_check" CHECK(`relationship` in ('clinic', 'nonprofit', 'sponsor'))
);
--> statement-breakpoint
CREATE INDEX `openchair_appointment_participants_user_idx` ON `openchair_appointment_participants` (`workspace_id`,`user_id`,`appointment_id`);
