CREATE TABLE `cloud_install` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`install_id` text NOT NULL,
	`install_key` text NOT NULL,
	`last_synced_at` text,
	`last_synced_bytes` integer,
	`last_synced_hash` text
);
