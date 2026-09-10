CREATE TABLE `egg_records` (
	`id` text PRIMARY KEY NOT NULL,
	`flock_id` text NOT NULL,
	`record_date` text NOT NULL,
	`eggs_collected` integer NOT NULL,
	`eggs_broken` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`flock_id`) REFERENCES `flocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `egg_records_flock_id_idx` ON `egg_records` (`flock_id`);--> statement-breakpoint
CREATE INDEX `egg_records_record_date_idx` ON `egg_records` (`record_date`);