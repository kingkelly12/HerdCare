ALTER TABLE `reminders` ADD `flock_id` text REFERENCES flocks(id);--> statement-breakpoint
CREATE INDEX `reminders_flock_id_idx` ON `reminders` (`flock_id`);--> statement-breakpoint
ALTER TABLE `settings` ADD `remind_poultry` integer DEFAULT true NOT NULL;