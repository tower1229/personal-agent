CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
