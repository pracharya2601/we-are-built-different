CREATE TABLE `call_transcript_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`job_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`speaker` text NOT NULL,
	`text_ciphertext` text NOT NULL,
	`fingerprint` text NOT NULL,
	`spoken_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `call_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `call_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "call_transcript_lines_speaker_check" CHECK("call_transcript_lines"."speaker" in ('agent', 'recipient'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_transcript_lines_attempt_fingerprint_uidx` ON `call_transcript_lines` (`attempt_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `call_transcript_lines_attempt_spoken_idx` ON `call_transcript_lines` (`attempt_id`,`spoken_at`);--> statement-breakpoint
CREATE INDEX `call_transcript_lines_created_idx` ON `call_transcript_lines` (`created_at`);