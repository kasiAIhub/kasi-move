CREATE TABLE `admin_code` (
	`id` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
