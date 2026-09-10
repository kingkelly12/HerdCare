CREATE TABLE `income_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`quantity` real,
	`unit` text,
	`income_date` text NOT NULL,
	`animal_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `income_entries_income_date_idx` ON `income_entries` (`income_date`);--> statement-breakpoint
CREATE INDEX `income_entries_category_idx` ON `income_entries` (`category`);--> statement-breakpoint
CREATE INDEX `income_entries_animal_id_idx` ON `income_entries` (`animal_id`);