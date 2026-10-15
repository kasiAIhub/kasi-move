CREATE TABLE `stall_claims` (
	`hash` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stall_claims_stall` ON `stall_claims` (`stall_id`);
