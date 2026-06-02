import {
  type ApprovalRequestStatus,
  type LongTaskStatus,
  type LongTaskStepStatus,
  type LongTaskToolPolicy,
  type MemoryStatus,
  type PersonalModelConfidence,
  type PersonalModelEventType,
  type PersonalModelEvidenceType,
  type PersonalModelEvidenceWeight,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type PersonalModelSensitivity,
  type PersonalModelSourceStatus,
  type PersonalModelSourceType,
  type PersonalModelStatus,
  type PersonalModelUsagePolicy,
  type MetacognitionReflectionType,
  type UnderstandingGapStatus,
  type RunStatus,
  type ScheduleCadence,
  type ScheduleExecutionStatus,
  skillPackageFileInventoryItemSchema,
  skillPackageMetadataSchema,
  skillValidationResultSchema,
  type SkillPackageFileInventoryItem,
  type SkillPackageMetadata,
  type SkillRouteTriggerType,
  type SkillRunStatus,
  type SkillValidationResult,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel,
  type RunFeedbackType
} from "@personal-agent/shared";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type LongTaskEventRecord,
  type LongTaskRecord,
  type LongTaskStepRecord,
  type MemoryRecord,
  type PersonalModelClaimRecord,
  type PersonalModelEvidenceRecord,
  type PersonalModelEventRecord,
  type PersonalModelMetacognitionLogRecord,
  type PersonalModelUnderstandingGapRecord,
  type PersonalModelSourceChunkRecord,
  type PersonalModelSourceDocumentRecord,
  type RunnableSkillRecord,
  type RunRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type SkillVersionRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type TodoRecord,
  type ToolCallRecord,
  type RunFeedbackRecord,
  type RunEvaluationRecord
} from "../../repositories.js";

export interface RunRow {
  id: string;
  owner_tg_user_id: number;
  chat_id: number;
  update_id: number | null;
  message_text: string | null;
  status: RunStatus;
  response_text: string | null;
  error: string | null;
  context_trace_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface RunFeedbackRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  feedback_type: RunFeedbackType;
  comment: string | null;
  created_at: number;
}

export interface RunEvaluationRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  groundedness_score: number;
  old_data_misuse_score: number;
  advice_fit_score: number;
  emotional_calibration_score: number;
  reasoning: string;
  created_at: number;
}

export interface ToolCallRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  tool_name: string;
  risk_level: ToolRiskLevel;
  status: ToolCallStatus;
  input_json: string;
  output_json: string | null;
  error: string | null;
  created_at: number;
}

export interface TodoRow {
  id: number;
  owner_tg_user_id: number;
  title: string;
  status: TodoStatus;
  created_at: number;
  completed_at: number | null;
  due_at: number | null;
  reminded_at: number | null;
}

export interface MemoryRow {
  id: number;
  owner_tg_user_id: number;
  content: string;
  normalized_content: string;
  status: MemoryStatus;
  created_at: number;
  deleted_at: number | null;
}

export interface ApprovalRequestRow {
  id: string;
  owner_tg_user_id: number;
  action: string;
  payload_json: string;
  status: ApprovalRequestStatus;
  code: string;
  created_at: number;
  decided_at: number | null;
}

export interface PersonalModelClaimRow {
  id: string;
  owner_tg_user_id: number;
  claim: string;
  layer: PersonalModelLayer;
  scenario: PersonalModelScenario;
  confidence: PersonalModelConfidence;
  status: PersonalModelStatus;
  usage_policy: PersonalModelUsagePolicy;
  sensitivity: PersonalModelSensitivity;
  valid_from: number | null;
  valid_until: number | null;
  last_confirmed_at: number | null;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}

export interface PersonalModelEventRow {
  id: string;
  claim_id: string | null;
  owner_tg_user_id: number;
  event_type: PersonalModelEventType;
  payload_json: string;
  created_at: number;
}

export interface PersonalModelSourceDocumentRow {
  id: string;
  owner_tg_user_id: number;
  source_type: PersonalModelSourceType;
  title: string;
  uri: string | null;
  content: string;
  normalized_content: string;
  status: PersonalModelSourceStatus;
  usage_policy: PersonalModelUsagePolicy;
  sensitivity: PersonalModelSensitivity;
  source_created_at: number | null;
  source_updated_at: number | null;
  ingested_at: number;
  metadata_json: string;
}

export interface PersonalModelSourceChunkRow {
  id: string;
  document_id: string;
  owner_tg_user_id: number;
  chunk_index: number;
  content: string;
  normalized_content: string;
  token_count: number | null;
  metadata_json: string;
  created_at: number;
  vector_id: string | null;
  indexed_at: number | null;
  index_status: "pending" | "indexed" | "failed";
}

export interface PersonalModelEvidenceRow {
  id: string;
  claim_id: string;
  owner_tg_user_id: number;
  evidence_type: PersonalModelEvidenceType;
  source_document_id: string | null;
  source_chunk_id: string | null;
  run_id: string | null;
  quote: string | null;
  weight: PersonalModelEvidenceWeight;
  created_at: number;
}

export interface PersonalModelMetacognitionLogRow {
  id: string;
  owner_tg_user_id: number;
  related_claim_id: string | null;
  related_gap_id: string | null;
  reflection_type: MetacognitionReflectionType;
  content: string;
  created_at: number;
}

export interface PersonalModelUnderstandingGapRow {
  id: string;
  owner_tg_user_id: number;
  scenario: PersonalModelScenario;
  gap_description: string;
  status: UnderstandingGapStatus;
  created_at: number;
  updated_at: number;
}

export interface SkillRow {
  id: string;
  owner_tg_user_id: number;
  name: string;
  description: string;
  draft_files_json: string;
  draft_metadata_json: string;
  draft_body: string;
  draft_file_inventory_json: string;
  draft_validation_json: string;
  draft_content_hash: string;
  enabled: number;
  deleted_at: number | null;
  published_version_id: string | null;
  published_version: number | null;
  created_at: number;
  updated_at: number;
}

export interface SkillVersionRow {
  id: string;
  skill_id: string;
  owner_tg_user_id: number;
  version: number;
  name: string;
  description: string;
  files_json: string;
  metadata_json: string;
  body: string;
  file_inventory_json: string;
  validation_json: string;
  content_hash: string;
  created_at: number;
}

export interface SkillRouteDecisionRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  input_text: string;
  trigger_type: SkillRouteTriggerType;
  matched_skill_id: string | null;
  matched_skill_name: string | null;
  matched_skill_version_id: string | null;
  confidence: number | null;
  reason: string;
  candidates_json: string;
  created_at: number;
}

export interface SkillRunRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  skill_id: string;
  skill_version_id: string;
  status: SkillRunStatus;
  input_text: string;
  output_text: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface ScheduleRow {
  id: string;
  owner_tg_user_id: number;
  name: string;
  command_text: string;
  enabled: number;
  timezone: "Asia/Shanghai";
  cadence: ScheduleCadence;
  time_of_day: string;
  days_of_week_json: string;
  next_run_at: number;
  last_run_at: number | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ScheduleExecutionRow {
  id: string;
  schedule_id: string;
  owner_tg_user_id: number;
  run_id: string | null;
  scheduled_for: number;
  status: ScheduleExecutionStatus;
  output_text: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface LongTaskRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  title: string;
  original_input: string;
  status: LongTaskStatus;
  complexity_score: number;
  planner_reason: string;
  current_step_id: string | null;
  output_text: string | null;
  error: string | null;
  replan_count: number;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface LongTaskStepRow {
  id: string;
  long_task_id: string;
  owner_tg_user_id: number;
  position: number;
  title: string;
  description: string;
  status: LongTaskStepStatus;
  tool_policy: LongTaskToolPolicy;
  success_criteria: string;
  input_json: string;
  output_json: string | null;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface LongTaskEventRow {
  id: string;
  long_task_id: string;
  owner_tg_user_id: number;
  step_id: string | null;
  event_type: string;
  payload_json: string;
  created_at: number;
}

export function toRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    chatId: row.chat_id,
    updateId: row.update_id,
    messageText: row.message_text,
    status: row.status,
    responseText: row.response_text,
    error: row.error,
    contextTraceJson: row.context_trace_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toToolCall(row: ToolCallRow): ToolCallRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    toolName: row.tool_name,
    riskLevel: row.risk_level,
    status: row.status,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    createdAt: row.created_at
  };
}

export function toTodo(row: TodoRow): TodoRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    dueAt: row.due_at,
    remindedAt: row.reminded_at
  };
}

export function toMemory(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    content: row.content,
    normalizedContent: row.normalized_content,
    status: row.status,
    createdAt: row.created_at,
    deletedAt: row.deleted_at
  };
}

export function toApproval(row: ApprovalRequestRow): ApprovalRequestRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    action: row.action,
    payloadJson: row.payload_json,
    status: row.status,
    code: row.code,
    createdAt: row.created_at,
    decidedAt: row.decided_at
  };
}

export function toPersonalModelClaim(
  row: PersonalModelClaimRow
): PersonalModelClaimRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    claim: row.claim,
    layer: row.layer,
    scenario: row.scenario,
    confidence: row.confidence,
    status: row.status,
    usagePolicy: row.usage_policy,
    sensitivity: row.sensitivity,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    lastConfirmedAt: row.last_confirmed_at,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toPersonalModelEvent(
  row: PersonalModelEventRow
): PersonalModelEventRecord {
  return {
    id: row.id,
    claimId: row.claim_id,
    ownerTgUserId: row.owner_tg_user_id,
    eventType: row.event_type,
    payloadJson: row.payload_json,
    createdAt: row.created_at
  };
}

export function toPersonalModelSourceDocument(
  row: PersonalModelSourceDocumentRow
): PersonalModelSourceDocumentRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    sourceType: row.source_type,
    title: row.title,
    uri: row.uri,
    content: row.content,
    normalizedContent: row.normalized_content,
    status: row.status,
    usagePolicy: row.usage_policy,
    sensitivity: row.sensitivity,
    sourceCreatedAt: row.source_created_at,
    sourceUpdatedAt: row.source_updated_at,
    ingestedAt: row.ingested_at,
    metadataJson: row.metadata_json
  };
}

export function toPersonalModelSourceChunk(
  row: PersonalModelSourceChunkRow
): PersonalModelSourceChunkRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    ownerTgUserId: row.owner_tg_user_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    normalizedContent: row.normalized_content,
    tokenCount: row.token_count,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    vectorId: row.vector_id,
    indexedAt: row.indexed_at,
    indexStatus: row.index_status
  };
}

export function toPersonalModelEvidence(
  row: PersonalModelEvidenceRow
): PersonalModelEvidenceRecord {
  return {
    id: row.id,
    claimId: row.claim_id,
    ownerTgUserId: row.owner_tg_user_id,
    evidenceType: row.evidence_type,
    sourceDocumentId: row.source_document_id,
    sourceChunkId: row.source_chunk_id,
    runId: row.run_id,
    quote: row.quote,
    weight: row.weight,
    createdAt: row.created_at
  };
}

export function toPersonalModelMetacognitionLog(
  row: PersonalModelMetacognitionLogRow
): PersonalModelMetacognitionLogRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    relatedClaimId: row.related_claim_id,
    relatedGapId: row.related_gap_id,
    reflectionType: row.reflection_type,
    content: row.content,
    createdAt: row.created_at
  };
}

export function toPersonalModelUnderstandingGap(
  row: PersonalModelUnderstandingGapRow
): PersonalModelUnderstandingGapRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    scenario: row.scenario,
    gapDescription: row.gap_description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseSkillFiles(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([path, content]) => [
      path,
      String(content)
    ])
  );
}

function parseSkillMetadata(value: string): SkillPackageMetadata {
  return skillPackageMetadataSchema.parse(JSON.parse(value));
}

function parseSkillFileInventory(
  value: string
): SkillPackageFileInventoryItem[] {
  return skillPackageFileInventoryItemSchema.array().parse(JSON.parse(value));
}

function parseSkillValidation(value: string): SkillValidationResult {
  return skillValidationResultSchema.parse(JSON.parse(value));
}

export function toSkill(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    name: row.name,
    description: row.description,
    draftFiles: parseSkillFiles(row.draft_files_json),
    draftMetadata: parseSkillMetadata(row.draft_metadata_json),
    draftBody: row.draft_body,
    draftFileInventory: parseSkillFileInventory(row.draft_file_inventory_json),
    draftValidation: parseSkillValidation(row.draft_validation_json),
    draftContentHash: row.draft_content_hash,
    enabled: row.enabled === 1,
    deletedAt: row.deleted_at,
    publishedVersionId: row.published_version_id,
    publishedVersion: row.published_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSkillVersion(row: SkillVersionRow): SkillVersionRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    ownerTgUserId: row.owner_tg_user_id,
    version: row.version,
    name: row.name,
    description: row.description,
    files: parseSkillFiles(row.files_json),
    metadata: parseSkillMetadata(row.metadata_json),
    body: row.body,
    fileInventory: parseSkillFileInventory(row.file_inventory_json),
    validation: parseSkillValidation(row.validation_json),
    contentHash: row.content_hash,
    createdAt: row.created_at
  };
}

export function toSkillRouteDecision(
  row: SkillRouteDecisionRow
): SkillRouteDecisionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    inputText: row.input_text,
    triggerType: row.trigger_type,
    matchedSkillId: row.matched_skill_id,
    matchedSkillName: row.matched_skill_name,
    matchedSkillVersionId: row.matched_skill_version_id,
    confidence: row.confidence,
    reason: row.reason,
    candidatesJson: row.candidates_json,
    createdAt: row.created_at
  };
}

export function toSkillRun(row: SkillRunRow): SkillRunRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    skillId: row.skill_id,
    skillVersionId: row.skill_version_id,
    status: row.status,
    inputText: row.input_text,
    outputText: row.output_text,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSchedule(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    name: row.name,
    commandText: row.command_text,
    enabled: row.enabled === 1,
    timezone: row.timezone,
    cadence: row.cadence,
    timeOfDay: row.time_of_day,
    daysOfWeek: JSON.parse(row.days_of_week_json) as number[],
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toScheduleExecution(
  row: ScheduleExecutionRow
): ScheduleExecutionRecord {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    ownerTgUserId: row.owner_tg_user_id,
    runId: row.run_id,
    scheduledFor: row.scheduled_for,
    status: row.status,
    outputText: row.output_text,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toRunFeedback(row: RunFeedbackRow): RunFeedbackRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    feedbackType: row.feedback_type,
    comment: row.comment,
    createdAt: row.created_at
  };
}

export function toRunEvaluation(row: RunEvaluationRow): RunEvaluationRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    groundednessScore: row.groundedness_score,
    oldDataMisuseScore: row.old_data_misuse_score,
    adviceFitScore: row.advice_fit_score,
    emotionalCalibrationScore: row.emotional_calibration_score,
    reasoning: row.reasoning,
    createdAt: row.created_at
  };
}

export function toLongTask(row: LongTaskRow): LongTaskRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    title: row.title,
    originalInput: row.original_input,
    status: row.status,
    complexityScore: row.complexity_score,
    plannerReason: row.planner_reason,
    currentStepId: row.current_step_id,
    outputText: row.output_text,
    error: row.error,
    replanCount: row.replan_count,
    telegramChatId: row.telegram_chat_id,
    telegramMessageId: row.telegram_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toLongTaskStep(row: LongTaskStepRow): LongTaskStepRecord {
  return {
    id: row.id,
    longTaskId: row.long_task_id,
    ownerTgUserId: row.owner_tg_user_id,
    position: row.position,
    title: row.title,
    description: row.description,
    status: row.status,
    toolPolicy: row.tool_policy,
    successCriteria: row.success_criteria,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

export function toLongTaskEvent(row: LongTaskEventRow): LongTaskEventRecord {
  return {
    id: row.id,
    longTaskId: row.long_task_id,
    ownerTgUserId: row.owner_tg_user_id,
    stepId: row.step_id,
    eventType: row.event_type,
    payloadJson: row.payload_json,
    createdAt: row.created_at
  };
}

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
