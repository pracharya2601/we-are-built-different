ALTER TABLE `subscriptions` ADD `pricing_key` text;--> statement-breakpoint
CREATE INDEX `subscriptions_pricing_key_idx` ON `subscriptions` (`pricing_key`);