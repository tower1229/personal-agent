export const runStatuses = ["running", "succeeded", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const todoStatuses = ["open", "completed"] as const;
export type TodoStatus = (typeof todoStatuses)[number];

export const toolCallStatuses = ["succeeded", "failed"] as const;
export type ToolCallStatus = (typeof toolCallStatuses)[number];

export const memoryTypes = [
  "profile",
  "preference",
  "fact",
  "project",
  "note"
] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const memoryEventTypes = [
  "created",
  "updated",
  "deleted",
  "searched",
  "duplicate_detected",
  "merged",
  "superseded",
  "archived",
  "accessed",
  "conflict_detected"
] as const;
export type MemoryEventType = (typeof memoryEventTypes)[number];

export const memoryStatuses = ["active", "archived", "deleted"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export const approvalRequestStatuses = [
  "pending",
  "rejected",
  "executing",
  "executed",
  "execution_failed",
  "expired"
] as const;
export type ApprovalRequestStatus =
  (typeof approvalRequestStatuses)[number];

export const documentSourceTypes = ["text", "markdown"] as const;
export type DocumentSourceType = (typeof documentSourceTypes)[number];

export const documentIndexStatuses = [
  "pending",
  "indexed",
  "failed"
] as const;
export type DocumentIndexStatus = (typeof documentIndexStatuses)[number];

export const scheduleCadences = ["daily", "weekly"] as const;
export type ScheduleCadence = (typeof scheduleCadences)[number];

export const scheduleExecutionStatuses = [
  "running",
  "succeeded",
  "failed"
] as const;
export type ScheduleExecutionStatus =
  (typeof scheduleExecutionStatuses)[number];

export const longTaskStatuses = [
  "planning",
  "running",
  "waiting_for_user",
  "paused",
  "succeeded",
  "failed",
  "cancelled"
] as const;
export type LongTaskStatus = (typeof longTaskStatuses)[number];

export const longTaskStepStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "blocked"
] as const;
export type LongTaskStepStatus = (typeof longTaskStepStatuses)[number];

export const longTaskToolPolicies = [
  "none",
  "read",
  "write_low",
  "external_send",
  "destructive"
] as const;
export type LongTaskToolPolicy = (typeof longTaskToolPolicies)[number];

export const evalCategories = [
  "casual_chat",
  "todo_create",
  "todo_list",
  "todo_complete",
  "memory_save",
  "memory_search",
  "memory_delete_approval",
  "document_add",
  "document_search",
  "document_no_evidence",
  "daily_brief",
  "safety",
  "approval",
  "tool_error_recovery"
] as const;
export type EvalCategory = (typeof evalCategories)[number];

export const toolRiskLevels = [
  "read",
  "write_low",
  "write_high",
  "external_send",
  "destructive"
] as const;
export type ToolRiskLevel = (typeof toolRiskLevels)[number];

export const skillKinds = ["chat"] as const;
export type SkillKind = (typeof skillKinds)[number];

export const skillStatuses = [
  "draft",
  "published",
  "disabled",
  "deleted"
] as const;
export type SkillStatus = (typeof skillStatuses)[number];

export const skillRouteTriggerTypes = [
  "explicit_id",
  "trigger_phrase",
  "none"
] as const;
export type SkillRouteTriggerType =
  (typeof skillRouteTriggerTypes)[number];

export const skillRunStatuses = ["running", "succeeded", "failed"] as const;
export type SkillRunStatus = (typeof skillRunStatuses)[number];

export const builtInToolNames = [
  "create_todo",
  "list_todos",
  "complete_todo",
  "save_memory",
  "search_memory",
  "delete_memory_request",
  "web_search",
  "fetch_url"
] as const;
export type BuiltInToolName = (typeof builtInToolNames)[number];
