ALTER TABLE `approval_requests` ADD `risk_level` text;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `operation_summary_json` text;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `approval_code` text;--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `executed_tool_call_id` integer;