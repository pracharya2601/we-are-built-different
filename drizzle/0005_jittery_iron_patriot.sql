CREATE TABLE `image_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`provider` text DEFAULT 's3' NOT NULL,
	`bucket` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`declared_size_bytes` integer NOT NULL,
	`stored_size_bytes` integer,
	`etag` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "image_uploads_provider_check" CHECK("image_uploads"."provider" in ('s3')),
	CONSTRAINT "image_uploads_status_check" CHECK("image_uploads"."status" in ('pending', 'completed', 'failed')),
	CONSTRAINT "image_uploads_declared_size_check" CHECK("image_uploads"."declared_size_bytes" > 0),
	CONSTRAINT "image_uploads_stored_size_check" CHECK("image_uploads"."stored_size_bytes" is null or "image_uploads"."stored_size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_uploads_bucket_object_uidx` ON `image_uploads` (`bucket`,`object_key`);--> statement-breakpoint
CREATE INDEX `image_uploads_workspace_status_idx` ON `image_uploads` (`workspace_id`,`status`,`created_at`);