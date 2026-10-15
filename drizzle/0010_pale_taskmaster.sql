CREATE TABLE `connector_contacts` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`verified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photo_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`item_id` text NOT NULL,
	`original` text NOT NULL,
	`image` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_access` (
	`member_id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`hash` text NOT NULL,
	`cipher` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_access_hash_unique` ON `team_access` (`hash`);