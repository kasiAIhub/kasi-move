ALTER TABLE `stalls` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `stalls_slug_unique` ON `stalls` (`slug`);
