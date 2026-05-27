import {
  type ApprovalRequestStatus,
  type LongTaskStatus,
  type LongTaskStepStatus,
  type LongTaskToolPolicy,
  type MemoryStatus,
  type PersonalModelConfidence,
  type PersonalModelEventType,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type PersonalModelSensitivity,
  type PersonalModelStatus,
  type PersonalModelUsagePolicy,
  type RunStatus,
  type ScheduleCadence,
  type ScheduleExecutionStatus,
  skillManifestSchema,
  type SkillManifest,
  type SkillRouteTriggerType,
  type SkillRunStatus,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel
} from "@personal-agent/shared";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type LongTaskEventRecord,
  type LongTaskRecord,
  type LongTaskStepRecord,
  type MemoryRecord,
  type PersonalModelClaimRecord,
  type PersonalModelEventRecord,
  type RunnableSkillRecord,
  type RunRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type SkillVersionRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type TodoRecord,
  type ToolCallRecord
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
  created_at: number;
  updated_at: number;
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

export interface SkillRow {
  id: string;
  owner_tg_user_id: number;
  draft_manifest_json: string;
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
  manifest_json: string;
  created_at: number;
}

export interface SkillRouteDecisionRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  input_text: string;
  trigger_type: SkillRouteTriggerType;
  matched_skill_id: string | null;
  matched_skill_version_id: string | null;
  confidence: number | null;
  reason: string;
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
    completedAt: row.completed_at
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

export function parseSkillManifest(value: string): SkillManifest {
  return skillManifestSchema.parse(JSON.parse(value));
}

export function toSkill(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    draftManifest: parseSkillManifest(row.draft_manifest_json),
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
    manifest: parseSkillManifest(row.manifest_json),
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
    matchedSkillVersionId: row.matched_skill_version_id,
    confidence: row.confidence,
    reason: row.reason,
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
