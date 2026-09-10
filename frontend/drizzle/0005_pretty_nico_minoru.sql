CREATE TABLE `flock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`flock_id` text NOT NULL,
	`type` text NOT NULL,
	`event_date` text NOT NULL,
	`quantity` integer,
	`description` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`flock_id`) REFERENCES `flocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flock_events_flock_id_idx` ON `flock_events` (`flock_id`);--> statement-breakpoint
CREATE INDEX `flock_events_event_date_idx` ON `flock_events` (`event_date`);--> statement-breakpoint
CREATE INDEX `flock_events_type_idx` ON `flock_events` (`type`);--> statement-breakpoint
CREATE TABLE `flocks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`poultry_type` text NOT NULL,
	`breed` text,
	`acquired_date` text NOT NULL,
	`source` text NOT NULL,
	`age_at_acquisition_days` integer DEFAULT 0 NOT NULL,
	`initial_count` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `flocks_status_idx` ON `flocks` (`status`);--> statement-breakpoint
CREATE INDEX `flocks_acquired_date_idx` ON `flocks` (`acquired_date`);