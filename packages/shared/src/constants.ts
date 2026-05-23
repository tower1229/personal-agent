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

export const workflowStatuses = ["running", "succeeded", "failed"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const workflowStepStatuses = [
  "running",
  "succeeded",
  "failed",
  "skipped"
] as const;
export type WorkflowStepStatus = (typeof workflowStepStatuses)[number];

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

export const skillKinds = ["chat", "workflow"] as const;
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
  "delete_memory_request"
] as const;
export type BuiltInToolName = (typeof builtInToolNames)[number];

export const workflowSkillStepTypes = [
  "llm",
  "tool",
  "web_search",
  "fetch_url",
  "rag_search",
  "wait",
  "approval",
  "condition",
  "send_telegram",
  "save_artifact"
] as const;
export type WorkflowSkillStepType =
  (typeof workflowSkillStepTypes)[number];
