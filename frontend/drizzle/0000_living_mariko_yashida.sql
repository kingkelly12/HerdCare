CREATE TABLE `animals` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_number` text NOT NULL,
	`name` text,
	`species` text NOT NULL,
	`breed` text,
	`gender` text NOT NULL,
	`birth_date` text,
	`dam_id` text,
	`sire_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `animals_tag_number_idx` ON `animals` (`tag_number`);--> statement-breakpoint
CREATE INDEX `animals_species_idx` ON `animals` (`species`);--> statement-breakpoint
CREATE INDEX `animals_status_idx` ON `animals` (`status`);--> statement-breakpoint
CREATE INDEX `animals_dam_id_idx` ON `animals` (`dam_id`);--> statement-breakpoint
CREATE INDEX `animals_sire_id_idx` ON `animals` (`sire_id`);--> statement-breakpoint
CREATE TABLE `birth_records` (
	`id` text PRIMARY KEY NOT NULL,
	`mother_id` text NOT NULL,
	`birth_date` text NOT NULL,
	`total_offspring` integer DEFAULT 0 NOT NULL,
	`live_births` integer DEFAULT 0 NOT NULL,
	`stillbirths` integer DEFAULT 0 NOT NULL,
	`birth_weight_avg` real,
	`delivery_type` text DEFAULT 'normal' NOT NULL,
	`weaning_due_date` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`mother_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `birth_records_mother_id_idx` ON `birth_records` (`mother_id`);--> statement-breakpoint
CREATE INDEX `birth_records_birth_date_idx` ON `birth_records` (`birth_date`);--> statement-breakpoint
CREATE TABLE `breeding_events` (
	`id` text PRIMARY KEY NOT NULL,
	`animal_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_date` text NOT NULL,
	`sire_id_or_code` text,
	`technician_name` text,
	`expected_due_date` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `breeding_events_animal_id_idx` ON `breeding_events` (`animal_id`);--> statement-breakpoint
CREATE INDEX `breeding_events_event_date_idx` ON `breeding_events` (`event_date`);--> statement-breakpoint
CREATE INDEX `breeding_events_expected_due_date_idx` ON `breeding_events` (`expected_due_date`);--> statement-breakpoint
CREATE TABLE `health_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`animal_id` text NOT NULL,
	`treatment_date` text NOT NULL,
	`condition_treated` text NOT NULL,
	`medication_given` text,
	`withdrawal_days` integer DEFAULT 0 NOT NULL,
	`withdrawal_end_date` text,
	`administered_by` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `health_logs_animal_id_idx` ON `health_logs` (`animal_id`);--> statement-breakpoint
CREATE INDEX `health_logs_treatment_date_idx` ON `health_logs` (`treatment_date`);--> statement-breakpoint
CREATE INDEX `health_logs_withdrawal_end_date_idx` ON `health_logs` (`withdrawal_end_date`);