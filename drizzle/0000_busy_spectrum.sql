CREATE TABLE `classifications` (
	`message_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`category_probs` text NOT NULL,
	`urgency` integer NOT NULL,
	`is_personal` real NOT NULL,
	`low_confidence` integer DEFAULT false NOT NULL,
	`model` text NOT NULL,
	`classified_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_message_idx` ON `feedback` (`message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`from_email` text DEFAULT '' NOT NULL,
	`from_domain` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`received_at` integer NOT NULL,
	`has_unsubscribe` integer DEFAULT false NOT NULL,
	`is_reply_to_me` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_received_idx` ON `messages` (`received_at`);--> statement-breakpoint
CREATE INDEX `messages_domain_idx` ON `messages` (`from_domain`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_history_id` text,
	`last_synced_at` integer
);
