ALTER TABLE `memories` ADD `normalized_content` text;--> statement-breakpoint
ALTER TABLE `memories` ADD `canonical_key` text;--> statement-breakpoint
ALTER TABLE `memories` ADD `status` text NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `memories` ADD `last_accessed_at` integer;--> statement-breakpoint
ALTER TABLE `memories` ADD `access_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `memories` ADD `superseded_by_memory_id` integer;--> statement-breakpoint
CREATE TABLE `memory_embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`embedding_json` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` integer NOT NULL
);
