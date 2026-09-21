ALTER TABLE `messages` ADD `user_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `messages_user_idx` ON `messages` (`user_email`);--> statement-breakpoint
ALTER TABLE `sync_state` ADD `user_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `sync_state_user_idx` ON `sync_state` (`user_email`);
