CREATE TABLE `licenses` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`token` text NOT NULL,
	`activated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`clock_high_water` text NOT NULL
);
