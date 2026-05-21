ALTER TABLE `approval_requests` ADD `execution_error` text;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `execution_attempts` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `approval_requests`
SET `status` = 'execution_failed',
    `execution_error` = 'Migrated from legacy approved status before execution hardening.'
WHERE `status` = 'approved';--> statement-breakpoint
ALTER TABLE `documents` ADD `index_status` text NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `documents` ADD `index_error` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `indexed_at` integer;--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`run_id` integer,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0,
	`max_attempts` integer NOT NULL DEFAULT 3,
	`available_at` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_available_idx` ON `jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `jobs_run_id_idx` ON `jobs` (`run_id`);
