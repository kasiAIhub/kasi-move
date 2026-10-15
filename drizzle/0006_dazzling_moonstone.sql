CREATE TABLE `whatsapp_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`text` text NOT NULL,
	`sent_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`message_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_message_id` ON `whatsapp_outbox` (`message_id`);