CREATE TABLE `vendor_passwords` (
	`stall_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
