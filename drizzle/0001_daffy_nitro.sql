ALTER TABLE `runs` ADD `model` text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `runs` ADD `metadata_json` text;
