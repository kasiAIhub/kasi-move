CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`stall_id`) REFERENCES `stalls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_stall_phone_role` ON `team_members` (`stall_id`,`phone`,`role`);--> statement-breakpoint
ALTER TABLE `rider_invites` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rider_invites` ADD `role` text DEFAULT 'rider' NOT NULL;
--> statement-breakpoint
INSERT INTO team_members(id,stall_id,phone,name,role,active,available,fee_cents,joined_at) SELECT 'legacy-'||id,id,rider_phone,COALESCE(json_extract(settings,'$.riderName'),''),'rider',1,1,COALESCE(json_extract(settings,'$.riderFeeCents'),1000),0 FROM stalls WHERE rider_phone IS NOT NULL;
