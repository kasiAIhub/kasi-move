CREATE TABLE `referral_awards` (
	`stall_id` text PRIMARY KEY NOT NULL,
	`connector_key` text NOT NULL,
	`connector_name` text NOT NULL,
	`vendor_name` text NOT NULL,
	`vendor_phone` text NOT NULL,
	`earned_at` integer NOT NULL,
	`amount_cents` integer DEFAULT 7500 NOT NULL,
	`paid_at` integer,
	`payout_reference` text
);
--> statement-breakpoint
ALTER TABLE `whatsapp_outbox` ADD `payload` text;
--> statement-breakpoint
INSERT INTO referral_awards(stall_id,connector_key,connector_name,vendor_name,vendor_phone,earned_at,amount_cents)
SELECT id,lower(replace(replace(trim(referral_name),' ',''),char(9),'')),trim(referral_name),name,phone,activated_at,7500 FROM stalls
WHERE activated_at IS NOT NULL AND length(trim(referral_name))>0 ON CONFLICT(stall_id) DO NOTHING;
