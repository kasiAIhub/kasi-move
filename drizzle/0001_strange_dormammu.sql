CREATE TABLE `login_codes` (
	`phone` text PRIMARY KEY NOT NULL,
	`proof` text NOT NULL,
	`cipher` text NOT NULL,
	`expires_at` integer NOT NULL
);
