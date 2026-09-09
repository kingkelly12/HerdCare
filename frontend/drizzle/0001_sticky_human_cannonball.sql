CREATE TABLE `reminder_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`interval_days` integer NOT NULL,
	`species_filter` text,
	`next_due_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminder_schedules_next_due_date_idx` ON `reminder_schedules` (`next_due_date`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`animal_id` text,
	`schedule_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`lead_days` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`source_table` text,
	`source_event_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `reminder_schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminders_due_date_idx` ON `reminders` (`due_date`);--> statement-breakpoint
CREATE INDEX `reminders_status_idx` ON `reminders` (`status`);--> statement-breakpoint
CREATE INDEX `reminders_animal_id_idx` ON `reminders` (`animal_id`);--> statement-breakpoint
CREATE INDEX `reminders_schedule_id_idx` ON `reminders` (`schedule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_source_idx` ON `reminders` (`source_table`,`source_event_id`,`type`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`digest_enabled` integer DEFAULT true NOT NULL,
	`digest_hour` integer DEFAULT 6 NOT NULL,
	`digest_minute` integer DEFAULT 0 NOT NULL,
	`remind_heat_return` integer DEFAULT true NOT NULL,
	`remind_birth_due` integer DEFAULT true NOT NULL,
	`remind_withdrawal_end` integer DEFAULT true NOT NULL,
	`remind_weaning_due` integer DEFAULT true NOT NULL,
	`remind_routine` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
