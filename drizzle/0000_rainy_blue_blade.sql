CREATE TABLE `order_counters` (
	`stall_id` text PRIMARY KEY NOT NULL,
	`next` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rider_invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`phone` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gate_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`customer_hash` text NOT NULL,
	`request_key` text NOT NULL,
	`body` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gate_orders_request` ON `gate_orders` (`customer_hash`,`request_key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`stall_id` text,
	`phone` text,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stalls` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`town` text DEFAULT '' NOT NULL,
	`hours` text DEFAULT '08:00–21:00' NOT NULL,
	`is_open` integer DEFAULT 0 NOT NULL,
	`takes_card` integer DEFAULT 0 NOT NULL,
	`rider_phone` text,
	`first_order_at` integer,
	`activated_at` integer,
	`settings` text DEFAULT '{}' NOT NULL,
	`payment_reported_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stalls_phone_unique` ON `stalls` (`phone`);