CREATE TABLE `activation_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shop_optouts` (
	`phone` text PRIMARY KEY NOT NULL,
	`stopped_at` integer NOT NULL
);
