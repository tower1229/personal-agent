CREATE TABLE `approval_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`run_id` integer,
	`tool_name` text NOT NULL,
	`tool_args_json` text NOT NULL,
	`summary` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`executed_at` integer
);
