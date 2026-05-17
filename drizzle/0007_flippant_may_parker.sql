CREATE TABLE `eval_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eval_run_id` integer NOT NULL,
	`case_id` text NOT NULL,
	`category` text NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`passed` integer NOT NULL,
	`score_json` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eval_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`total` integer NOT NULL,
	`passed` integer NOT NULL,
	`failed` integer NOT NULL,
	`pass_rate` integer NOT NULL
);
