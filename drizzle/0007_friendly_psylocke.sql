CREATE TABLE `customer_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`device_hash` text NOT NULL,
	`phone` text NOT NULL,
	`proof` text NOT NULL,
	`cipher` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_devices` (
	`device_hash` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`gate_note` text NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_profile_phone` ON `customer_profiles` (`phone`);