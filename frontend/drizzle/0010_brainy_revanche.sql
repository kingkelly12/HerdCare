CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplier_payments_supplier_id_idx` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_payment_date_idx` ON `supplier_payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `suppliers_name_idx` ON `suppliers` (`name`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `supplier_id` text REFERENCES suppliers(id);--> statement-breakpoint
CREATE INDEX `expenses_supplier_id_idx` ON `expenses` (`supplier_id`);