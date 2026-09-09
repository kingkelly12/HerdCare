CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`quantity` real,
	`unit` text,
	`expense_date` text NOT NULL,
	`animal_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_expense_date_idx` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category`);--> statement-breakpoint
CREATE INDEX `expenses_animal_id_idx` ON `expenses` (`animal_id`);--> statement-breakpoint
CREATE TABLE `milk_records` (
	`id` text PRIMARY KEY NOT NULL,
	`animal_id` text NOT NULL,
	`record_date` text NOT NULL,
	`session` text NOT NULL,
	`litres` real NOT NULL,
	`price_per_litre` real,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milk_records_animal_id_idx` ON `milk_records` (`animal_id`);--> statement-breakpoint
CREATE INDEX `milk_records_record_date_idx` ON `milk_records` (`record_date`);--> statement-breakpoint
ALTER TABLE `settings` ADD `milk_price_per_litre` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `currency` text DEFAULT 'KES' NOT NULL;