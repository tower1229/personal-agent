export const runStatuses = ["running", "succeeded", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const chatSessionStatuses = ["active", "closed"] as const;
export type ChatSessionStatus = (typeof chatSessionStatuses)[number];

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

export const memoryStatuses = ["active", "archived"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export const personalModelLayers = [
  "fact",
  "preference",
  "pattern",
  "value",
  "interpretation_framework",
  "current_state",
  "positive_resource",
  "negative_pattern",
  "boundary"
] as const;
export type PersonalModelLayer = (typeof personalModelLayers)[number];

export const personalModelScenarios = [
  "global",
  "writing",
  "health",
  "relationship",
  "self_knowledge",
  "emotional_support",
  "work_decision",
  "technical_writing",
  "technical_collaboration",
  "life_decision"
] as const;
export type PersonalModelScenario = (typeof personalModelScenarios)[number];

export const personalModelConfidences = ["low", "medium", "high"] as const;
export type PersonalModelConfidence =
  (typeof personalModelConfidences)[number];

export const personalModelStatuses = [
  "proposed",
  "active",
  "under_revision",
  "deprecated",
  "archived",
  "deleted"
] as const;
export type PersonalModelStatus = (typeof personalModelStatuses)[number];

export const personalModelUsagePolicies = [
  "default_available",
  "use_only_if_relevant",
  "use_only_if_user_mentions",
  "do_not_use"
] as const;
export type PersonalModelUsagePolicy =
  (typeof personalModelUsagePolicies)[number];

export const personalModelSensitivities = [
  "low",
  "medium",
  "high"
] as const;
export type PersonalModelSensitivity =
  (typeof personalModelSensitivities)[number];

export const personalModelEventTypes = [
  "proposed",
  "created",
  "updated",
  "confirmed",
  "corrected",
  "deprecated",
  "merged",
  "conflict_detected",
  "used_in_response",
  "excluded_by_policy"
] as const;
export type PersonalModelEventType =
  (typeof personalModelEventTypes)[number];

export const personalModelSourceTypes = [
  "manual_note",
  "writing",
  "blog",
  "weekly",
  "qq_export",
  "weibo_export",
  "health_log",
  "relationship_note",
  "personality_framework"
] as const;
export type PersonalModelSourceType =
  (typeof personalModelSourceTypes)[number];

export const personalModelSourceStatuses = [
  "active",
  "hidden",
  "deleted"
] as const;
export type PersonalModelSourceStatus =
  (typeof personalModelSourceStatuses)[number];

export const personalModelEvidenceTypes = [
  "source_chunk",
  "conversation_run",
  "manual_confirmation",
  "admin_edit",
  "framework_consistency",
  "behavioral_observation"
] as const;
export type PersonalModelEvidenceType =
  (typeof personalModelEvidenceTypes)[number];

export const metacognitionReflectionTypes = ['correction', 'observation', 'conflict_resolution'] as const;
export type MetacognitionReflectionType = (typeof metacognitionReflectionTypes)[number];

export const understandingGapStatuses = ["open", "resolved", "ignored"] as const;
export type UnderstandingGapStatus = (typeof understandingGapStatuses)[number];

export const runFeedbackTypes = [
  "emotion_misjudgment",
  "old_data_misuse",
  "advice_mismatch",
  "over_challenged",
  "over_compliant",
  "positive"
] as const;
export type RunFeedbackType = (typeof runFeedbackTypes)[number];

export const personalModelEvidenceWeights = [
  "weak",
  "medium",
  "strong"
] as const;
export type PersonalModelEvidenceWeight =
  (typeof personalModelEvidenceWeights)[number];

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

export const controlledToolNames = ["web_search", "fetch_url"] as const;
export type ControlledToolName = (typeof controlledToolNames)[number];

export const plannerRouteModes = ["none", "plan_guided", "ask_user"] as const;
export type PlannerRouteMode = (typeof plannerRouteModes)[number];

export const plannerToolActionRisks = ["none", "external_read"] as const;
export type PlannerToolActionRisk =
  (typeof plannerToolActionRisks)[number];

export const plannerFreshnessRisks = ["low", "medium", "high"] as const;
export type PlannerFreshnessRisk = (typeof plannerFreshnessRisks)[number];

export const plannerPrivacyRisks = ["low", "medium", "high"] as const;
export type PlannerPrivacyRisk = (typeof plannerPrivacyRisks)[number];

export const pendingPlannerRouteClarificationOptions = [
  "allow_web",
  "no_web",
  "provide_url",
  "clarify_target"
] as const;
export type PendingPlannerRouteClarificationOption =
  (typeof pendingPlannerRouteClarificationOptions)[number];

export const skillStatuses = [
  "draft",
  "published",
  "disabled",
  "deleted"
] as const;
export type SkillStatus = (typeof skillStatuses)[number];

export const skillRouteTriggerTypes = [
  "explicit_name",
  "semantic",
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
  "update_core_memory",
  "search_memory",
  "delete_memory_request",
  "web_search",
  "fetch_url",
  "record_understanding_gap",
  "record_metacognition_log",
  "save_interview_source",
  "submit_answer"
] as const;
export type BuiltInToolName = (typeof builtInToolNames)[number];

export const ROUTING_CONFIDENCE_AUTO_RUN_THRESHOLD = 0.75;
export const ROUTING_CONFIDENCE_CONFIRM_THRESHOLD = 0.50;
