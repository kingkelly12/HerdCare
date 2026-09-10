CREATE TABLE `customer_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_payments_customer_id_idx` ON `customer_payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_payments_payment_date_idx` ON `customer_payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`product` text NOT NULL,
	`delivery_date` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deliveries_customer_id_idx` ON `deliveries` (`customer_id`);--> statement-breakpoint
CREATE INDEX `deliveries_delivery_date_idx` ON `deliveries` (`delivery_date`);--> statement-breakpoint
ALTER TABLE `settings` ADD `egg_price_per_tray` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `meat_price_per_kg` real DEFAULT 0 NOT NULL;