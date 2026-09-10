CREATE TABLE `hatch_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_flock_id` text,
	`set_date` text NOT NULL,
	`eggs_set` integer NOT NULL,
	`incubation_days` integer DEFAULT 21 NOT NULL,
	`fertile_eggs` integer,
	`candled_date` text,
	`hatched_date` text,
	`chicks_hatched` integer,
	`resulting_flock_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_flock_id`) REFERENCES `flocks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resulting_flock_id`) REFERENCES `flocks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hatch_batches_set_date_idx` ON `hatch_batches` (`set_date`);--> statement-breakpoint
CREATE INDEX `hatch_batches_source_flock_id_idx` ON `hatch_batches` (`source_flock_id`);--> statement-breakpoint
ALTER TABLE `reminders` ADD `hatch_batch_id` text REFERENCES hatch_batches(id);--> statement-breakpoint
CREATE INDEX `reminders_hatch_batch_id_idx` ON `reminders` (`hatch_batch_id`);