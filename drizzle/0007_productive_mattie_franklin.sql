PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_image_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`provider` text DEFAULT 'r2' NOT NULL,
	`bucket` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`declared_size_bytes` integer NOT NULL,
	`stored_size_bytes` integer,
	`etag` text,
	`version_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "image_uploads_provider_check" CHECK("__new_image_uploads"."provider" in ('s3', 'r2')),
	CONSTRAINT "image_uploads_status_check" CHECK("__new_image_uploads"."status" in ('pending', 'completed', 'failed')),
	CONSTRAINT "image_uploads_declared_size_check" CHECK("__new_image_uploads"."declared_size_bytes" > 0),
	CONSTRAINT "image_uploads_stored_size_check" CHECK("__new_image_uploads"."stored_size_bytes" is null or "__new_image_uploads"."stored_size_bytes" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_image_uploads`("id", "workspace_id", "created_by_user_id", "provider", "bucket", "object_key", "original_filename", "content_type", "declared_size_bytes", "stored_size_bytes", "etag", "version_id", "status", "completed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "created_by_user_id", "provider", "bucket", "object_key", "original_filename", "content_type", "declared_size_bytes", "stored_size_bytes", "etag", "version_id", "status", "completed_at", "created_at", "updated_at" FROM `image_uploads`;--> statement-breakpoint
DROP TABLE `image_uploads`;--> statement-breakpoint
ALTER TABLE `__new_image_uploads` RENAME TO `image_uploads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `image_uploads_bucket_object_uidx` ON `image_uploads` (`bucket`,`object_key`);--> statement-breakpoint
CREATE INDEX `image_uploads_workspace_status_idx` ON `image_uploads` (`workspace_id`,`status`,`created_at`);