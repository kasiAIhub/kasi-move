ALTER TABLE `rider_invites` ADD `fee_cents` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `rider_invites` ADD `decision` text;