CREATE TABLE `cloud_account` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`phone` text NOT NULL,
	`device_token` text NOT NULL,
	`signed_in_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_backup_at` text,
	`last_backup_bytes` integer,
	`last_restore_at` text
);
