CREATE TABLE `memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`confidence` integer DEFAULT 80 NOT NULL,
	`importance` integer DEFAULT 50 NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` integer,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source_run_id` integer,
	`reason` text,
	`created_at` integer NOT NULL
);
