import {
  type ApprovalRequestStatus,
  type MemoryStatus,
  type RunStatus,
  type ScheduleCadence,
  type ScheduleExecutionStatus,
  skillManifestSchema,
  type SkillManifest,
  type SkillRouteTriggerType,
  type SkillRunStatus,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel,
  type WorkflowRunSource,
  type WorkflowSkillStepType,
  type WorkflowStatus,
  type WorkflowStepStatus
} from "@personal-agent/shared";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
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
  type WorkflowRunRecord,
  type WorkflowStepRecord
} from "./repositories.js";

interface RunRow {
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

interface ToolCallRow {
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

interface TodoRow {
  id: number;
  owner_tg_user_id: number;
  title: string;
  status: TodoStatus;
  created_at: number;
  completed_at: number | null;
}

interface MemoryRow {
  id: number;
  owner_tg_user_id: number;
  content: string;
  normalized_content: string;
  status: MemoryStatus;
  created_at: number;
  deleted_at: number | null;
}

interface ApprovalRequestRow {
  id: string;
  owner_tg_user_id: number;
  action: string;
  payload_json: string;
  status: ApprovalRequestStatus;
  code: string;
  created_at: number;
  decided_at: number | null;
}

interface SkillRow {
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

interface SkillVersionRow {
  id: string;
  skill_id: string;
  owner_tg_user_id: number;
  version: number;
  manifest_json: string;
  created_at: number;
}

interface SkillRouteDecisionRow {
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

interface SkillRunRow {
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

interface WorkflowRunRow {
  id: string;
  run_id: string;
  owner_tg_user_id: number;
  skill_id: string;
  skill_version_id: string;
  cloudflare_workflow_instance_id: string | null;
  source: WorkflowRunSource;
  status: WorkflowStatus;
  input_text: string;
  output_text: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface WorkflowStepRow {
  id: string;
  workflow_run_id: string;
  owner_tg_user_id: number;
  step_id: string;
  step_type: WorkflowSkillStepType;
  status: WorkflowStepStatus;
  input_json: string;
  output_json: string | null;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

interface ScheduleRow {
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

interface ScheduleExecutionRow {
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

function toRun(row: RunRow): RunRecord {
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

function toToolCall(row: ToolCallRow): ToolCallRecord {
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

function toTodo(row: TodoRow): TodoRecord {
  return {
    id: row.id,
    ownerTgUserId: row.owner_tg_user_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function toMemory(row: MemoryRow): MemoryRecord {
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

function toApproval(row: ApprovalRequestRow): ApprovalRequestRecord {
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

function parseSkillManifest(value: string): SkillManifest {
  return skillManifestSchema.parse(JSON.parse(value));
}

function toSkill(row: SkillRow): SkillRecord {
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

function toSkillVersion(row: SkillVersionRow): SkillVersionRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    ownerTgUserId: row.owner_tg_user_id,
    version: row.version,
    manifest: parseSkillManifest(row.manifest_json),
    createdAt: row.created_at
  };
}

function toSkillRouteDecision(
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

function toSkillRun(row: SkillRunRow): SkillRunRecord {
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

function toWorkflowRun(row: WorkflowRunRow): WorkflowRunRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerTgUserId: row.owner_tg_user_id,
    skillId: row.skill_id,
    skillVersionId: row.skill_version_id,
    cloudflareWorkflowInstanceId: row.cloudflare_workflow_instance_id,
    source: row.source,
    status: row.status,
    inputText: row.input_text,
    outputText: row.output_text,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toWorkflowStep(row: WorkflowStepRow): WorkflowStepRecord {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    ownerTgUserId: row.owner_tg_user_id,
    stepId: row.step_id,
    stepType: row.step_type,
    status: row.status,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

function toSchedule(row: ScheduleRow): ScheduleRecord {
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

function toScheduleExecution(
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

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function createD1Repositories(db: D1Database): AgentRepositories {
  return {
    async createRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO runs (
            id, owner_tg_user_id, chat_id, update_id, message_text,
            status, response_text, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'running', NULL, NULL, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.chatId,
          input.updateId,
          input.messageText,
          input.createdAt,
          input.updatedAt
        )
        .first<RunRow>();

      if (!row) {
        throw new Error("Failed to create run");
      }

      return toRun(row);
    },

    async updateRun(id, patch) {
      await db
        .prepare(
          `UPDATE runs
          SET status = ?, response_text = ?, error = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(
          patch.status,
          patch.responseText ?? null,
          patch.error ?? null,
          patch.updatedAt,
          id
        )
        .run();
    },

    async listRuns(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM runs
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<RunRow>();

      return (results ?? []).map(toRun);
    },

    async recordToolCall(input) {
      await db
        .prepare(
          `INSERT INTO tool_calls (
            id, run_id, owner_tg_user_id, tool_name, risk_level, status,
            input_json, output_json, error, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.toolName,
          input.riskLevel,
          input.status,
          input.inputJson,
          input.outputJson,
          input.error,
          input.createdAt
        )
        .run();
    },

    async createTodo(input) {
      const row = await db
        .prepare(
          `INSERT INTO todos (
            owner_tg_user_id, title, status, created_at, completed_at
          ) VALUES (?, ?, 'open', ?, NULL)
          RETURNING *`
        )
        .bind(input.ownerTgUserId, input.title, input.createdAt)
        .first<TodoRow>();

      if (!row) {
        throw new Error("Failed to create todo");
      }

      return toTodo(row);
    },

    async listOpenTodos(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM todos
          WHERE owner_tg_user_id = ? AND status = 'open'
          ORDER BY created_at ASC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<TodoRow>();

      return (results ?? []).map(toTodo);
    },

    async listTodos(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM todos
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<TodoRow>();

      return (results ?? []).map(toTodo);
    },

    async completeTodo(input) {
      const row = await db
        .prepare(
          `UPDATE todos
          SET status = 'completed', completed_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND status = 'open'
          RETURNING *`
        )
        .bind(input.completedAt, input.ownerTgUserId, input.id)
        .first<TodoRow>();

      return row ? toTodo(row) : null;
    },

    async createMemory(input) {
      const row = await db
        .prepare(
          `INSERT INTO memories (
            owner_tg_user_id, content, normalized_content, status,
            created_at, deleted_at
          ) VALUES (?, ?, ?, 'active', ?, NULL)
          RETURNING *`
        )
        .bind(
          input.ownerTgUserId,
          input.content,
          input.normalizedContent,
          input.createdAt
        )
        .first<MemoryRow>();

      if (!row) {
        throw new Error("Failed to create memory");
      }

      return toMemory(row);
    },

    async searchMemories(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM memories
          WHERE owner_tg_user_id = ?
            AND status = 'active'
            AND normalized_content LIKE ? ESCAPE '\\'
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, `%${escapeLike(input.keyword)}%`, input.limit)
        .all<MemoryRow>();

      return (results ?? []).map(toMemory);
    },

    async getActiveMemory(input) {
      const row = await db
        .prepare(
          `SELECT * FROM memories
          WHERE owner_tg_user_id = ? AND id = ? AND status = 'active'`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<MemoryRow>();

      return row ? toMemory(row) : null;
    },

    async listMemories(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM memories
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<MemoryRow>();

      return (results ?? []).map(toMemory);
    },

    async markMemoryDeleted(input) {
      const row = await db
        .prepare(
          `UPDATE memories
          SET status = 'deleted', deleted_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND status = 'active'
          RETURNING *`
        )
        .bind(input.deletedAt, input.ownerTgUserId, input.id)
        .first<MemoryRow>();

      return row ? toMemory(row) : null;
    },

    async recordMemoryEvent(input) {
      await db
        .prepare(
          `INSERT INTO memory_events (
            memory_id, owner_tg_user_id, event_type, payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          input.memoryId,
          input.ownerTgUserId,
          input.eventType,
          JSON.stringify(input.payload),
          input.createdAt
        )
        .run();
    },

    async createApproval(input) {
      const row = await db
        .prepare(
          `INSERT INTO approval_requests (
            id, owner_tg_user_id, action, payload_json, status, code,
            created_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.action,
          input.payloadJson,
          input.status,
          input.code,
          input.createdAt,
          input.decidedAt
        )
        .first<ApprovalRequestRow>();

      if (!row) {
        throw new Error("Failed to create approval");
      }

      return toApproval(row);
    },

    async findPendingApprovalByCode(input) {
      const row = await db
        .prepare(
          `SELECT * FROM approval_requests
          WHERE owner_tg_user_id = ? AND code = ? AND status = 'pending'`
        )
        .bind(input.ownerTgUserId, input.code)
        .first<ApprovalRequestRow>();

      return row ? toApproval(row) : null;
    },

    async updateApprovalStatus(input) {
      await db
        .prepare(
          `UPDATE approval_requests
          SET status = ?, decided_at = ?
          WHERE id = ?`
        )
        .bind(input.status, input.decidedAt, input.id)
        .run();
    },

    async listApprovals(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM approval_requests
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<ApprovalRequestRow>();

      return (results ?? []).map(toApproval);
    },

    async createSkill(input) {
      const manifestJson = JSON.stringify(input.manifest);
      const row = await db
        .prepare(
          `INSERT INTO skills (
            id, owner_tg_user_id, draft_manifest_json, enabled, deleted_at,
            published_version_id, published_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
          RETURNING *`
        )
        .bind(
          input.manifest.id,
          input.ownerTgUserId,
          manifestJson,
          input.manifest.enabled ? 1 : 0,
          input.createdAt,
          input.createdAt
        )
        .first<SkillRow>();

      if (!row) {
        throw new Error("Failed to create skill");
      }

      return toSkill(row);
    },

    async updateSkillDraft(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET draft_manifest_json = ?, enabled = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          JSON.stringify(input.manifest),
          input.manifest.enabled ? 1 : 0,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async listSkills(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ?
          ORDER BY updated_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRow>();

      return (results ?? []).map(toSkill);
    },

    async getSkill(input) {
      const row = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async setSkillEnabled(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET enabled = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          input.enabled ? 1 : 0,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async softDeleteSkill(input) {
      const row = await db
        .prepare(
          `UPDATE skills
          SET enabled = 0, deleted_at = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(input.deletedAt, input.deletedAt, input.ownerTgUserId, input.id)
        .first<SkillRow>();

      return row ? toSkill(row) : null;
    },

    async publishSkill(input) {
      const skill = await this.getSkill({
        ownerTgUserId: input.ownerTgUserId,
        id: input.id
      });

      if (!skill || skill.deletedAt !== null) {
        return null;
      }

      const nextVersion = (skill.publishedVersion ?? 0) + 1;
      const versionRow = await db
        .prepare(
          `INSERT INTO skill_versions (
            id, skill_id, owner_tg_user_id, version, manifest_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.versionId,
          skill.id,
          input.ownerTgUserId,
          nextVersion,
          JSON.stringify(skill.draftManifest),
          input.createdAt
        )
        .first<SkillVersionRow>();

      if (!versionRow) {
        throw new Error("Failed to publish skill");
      }

      await db
        .prepare(
          `UPDATE skills
          SET published_version_id = ?, published_version = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(
          versionRow.id,
          versionRow.version,
          input.createdAt,
          input.ownerTgUserId,
          skill.id
        )
        .run();

      return toSkillVersion(versionRow);
    },

    async getRunnableSkillById(input) {
      const row = await db
        .prepare(
          `SELECT
            s.id AS skill_id,
            s.owner_tg_user_id AS skill_owner_tg_user_id,
            s.draft_manifest_json,
            s.enabled,
            s.deleted_at,
            s.published_version_id,
            s.published_version,
            s.created_at AS skill_created_at,
            s.updated_at,
            v.id AS version_id,
            v.version,
            v.manifest_json,
            v.created_at AS version_created_at
          FROM skills s
          JOIN skill_versions v ON v.id = s.published_version_id
          WHERE s.owner_tg_user_id = ?
            AND s.id = ?
            AND s.enabled = 1
            AND s.deleted_at IS NULL`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<{
          skill_id: string;
          skill_owner_tg_user_id: number;
          draft_manifest_json: string;
          enabled: number;
          deleted_at: number | null;
          published_version_id: string | null;
          published_version: number | null;
          skill_created_at: number;
          updated_at: number;
          version_id: string;
          version: number;
          manifest_json: string;
          version_created_at: number;
        }>();

      if (!row) {
        return null;
      }

      return {
        skill: toSkill({
          id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          draft_manifest_json: row.draft_manifest_json,
          enabled: row.enabled,
          deleted_at: row.deleted_at,
          published_version_id: row.published_version_id,
          published_version: row.published_version,
          created_at: row.skill_created_at,
          updated_at: row.updated_at
        }),
        version: toSkillVersion({
          id: row.version_id,
          skill_id: row.skill_id,
          owner_tg_user_id: row.skill_owner_tg_user_id,
          version: row.version,
          manifest_json: row.manifest_json,
          created_at: row.version_created_at
        })
      };
    },

    async listRunnableSkills(ownerTgUserId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skills
          WHERE owner_tg_user_id = ?
            AND enabled = 1
            AND deleted_at IS NULL
            AND published_version_id IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 100`
        )
        .bind(ownerTgUserId)
        .all<SkillRow>();
      const runnable: RunnableSkillRecord[] = [];

      for (const skillRow of results ?? []) {
        const skill = toSkill(skillRow);
        const version = skill.publishedVersionId
          ? await db
              .prepare(
                `SELECT * FROM skill_versions
                WHERE owner_tg_user_id = ? AND id = ?`
              )
              .bind(ownerTgUserId, skill.publishedVersionId)
              .first<SkillVersionRow>()
          : null;

        if (version) {
          runnable.push({
            skill,
            version: toSkillVersion(version)
          });
        }
      }

      return runnable;
    },

    async createSkillRouteDecision(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_route_decisions (
            id, run_id, owner_tg_user_id, input_text, trigger_type,
            matched_skill_id, matched_skill_version_id, confidence,
            reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.inputText,
          input.triggerType,
          input.matchedSkillId,
          input.matchedSkillVersionId,
          input.confidence,
          input.reason,
          input.createdAt
        )
        .first<SkillRouteDecisionRow>();

      if (!row) {
        throw new Error("Failed to create skill route decision");
      }

      return toSkillRouteDecision(row);
    },

    async listSkillRouteDecisions(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skill_route_decisions
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRouteDecisionRow>();

      return (results ?? []).map(toSkillRouteDecision);
    },

    async createSkillRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO skill_runs (
            id, run_id, owner_tg_user_id, skill_id, skill_version_id, status,
            input_text, output_text, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.skillId,
          input.skillVersionId,
          input.status,
          input.inputText,
          input.outputText,
          input.error,
          input.createdAt,
          input.updatedAt
        )
        .first<SkillRunRow>();

      if (!row) {
        throw new Error("Failed to create skill run");
      }

      return toSkillRun(row);
    },

    async updateSkillRun(input) {
      await db
        .prepare(
          `UPDATE skill_runs
          SET status = ?, output_text = ?, error = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.outputText ?? null,
          input.error ?? null,
          input.updatedAt,
          input.id
        )
        .run();
    },

    async listSkillRuns(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM skill_runs
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<SkillRunRow>();

      return (results ?? []).map(toSkillRun);
    },

    async createWorkflowRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO workflow_runs (
            id, run_id, owner_tg_user_id, skill_id, skill_version_id,
            cloudflare_workflow_instance_id, source, status, input_text,
            output_text, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.skillId,
          input.skillVersionId,
          input.cloudflareWorkflowInstanceId,
          input.source,
          input.status,
          input.inputText,
          input.outputText,
          input.error,
          input.createdAt,
          input.updatedAt
        )
        .first<WorkflowRunRow>();

      if (!row) {
        throw new Error("Failed to create workflow run");
      }

      return toWorkflowRun(row);
    },

    async updateWorkflowRun(input) {
      await db
        .prepare(
          `UPDATE workflow_runs
          SET status = ?,
            output_text = ?,
            error = ?,
            cloudflare_workflow_instance_id =
              COALESCE(?, cloudflare_workflow_instance_id),
            updated_at = ?
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.outputText ?? null,
          input.error ?? null,
          input.cloudflareWorkflowInstanceId ?? null,
          input.updatedAt,
          input.id
        )
        .run();
    },

    async getWorkflowRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM workflow_runs
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<WorkflowRunRow>();

      return row ? toWorkflowRun(row) : null;
    },

    async listWorkflowRuns(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM workflow_runs
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<WorkflowRunRow>();

      return (results ?? []).map(toWorkflowRun);
    },

    async createWorkflowStep(input) {
      const row = await db
        .prepare(
          `INSERT INTO workflow_steps (
            id, workflow_run_id, owner_tg_user_id, step_id, step_type,
            status, input_json, output_json, error, started_at,
            completed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.workflowRunId,
          input.ownerTgUserId,
          input.stepId,
          input.stepType,
          input.status,
          input.inputJson,
          input.outputJson,
          input.error,
          input.startedAt,
          input.completedAt,
          input.createdAt
        )
        .first<WorkflowStepRow>();

      if (!row) {
        throw new Error("Failed to create workflow step");
      }

      return toWorkflowStep(row);
    },

    async updateWorkflowStep(input) {
      await db
        .prepare(
          `UPDATE workflow_steps
          SET status = ?, output_json = ?, error = ?, completed_at = ?
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.outputJson ?? null,
          input.error ?? null,
          input.completedAt ?? null,
          input.id
        )
        .run();
    },

    async listWorkflowSteps(workflowRunId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM workflow_steps
          WHERE workflow_run_id = ?
          ORDER BY created_at ASC`
        )
        .bind(workflowRunId)
        .all<WorkflowStepRow>();

      return (results ?? []).map(toWorkflowStep);
    },

    async createSchedule(input) {
      const row = await db
        .prepare(
          `INSERT INTO schedules (
            id, owner_tg_user_id, name, command_text, enabled, timezone,
            cadence, time_of_day, days_of_week_json, next_run_at,
            last_run_at, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.ownerTgUserId,
          input.name,
          input.commandText,
          input.enabled ? 1 : 0,
          input.timezone,
          input.cadence,
          input.timeOfDay,
          JSON.stringify(input.daysOfWeek),
          input.nextRunAt,
          input.lastRunAt,
          input.deletedAt,
          input.createdAt,
          input.updatedAt
        )
        .first<ScheduleRow>();

      if (!row) {
        throw new Error("Failed to create schedule");
      }

      return toSchedule(row);
    },

    async updateSchedule(input) {
      const row = await db
        .prepare(
          `UPDATE schedules
          SET name = ?, command_text = ?, enabled = ?, timezone = ?,
            cadence = ?, time_of_day = ?, days_of_week_json = ?,
            next_run_at = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          input.name,
          input.commandText,
          input.enabled ? 1 : 0,
          input.timezone,
          input.cadence,
          input.timeOfDay,
          JSON.stringify(input.daysOfWeek),
          input.nextRunAt,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<ScheduleRow>();

      return row ? toSchedule(row) : null;
    },

    async setScheduleEnabled(input) {
      const row = await db
        .prepare(
          `UPDATE schedules
          SET enabled = ?, next_run_at = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(
          input.enabled ? 1 : 0,
          input.nextRunAt,
          input.updatedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<ScheduleRow>();

      return row ? toSchedule(row) : null;
    },

    async softDeleteSchedule(input) {
      const row = await db
        .prepare(
          `UPDATE schedules
          SET enabled = 0, deleted_at = ?, updated_at = ?
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL
          RETURNING *`
        )
        .bind(input.deletedAt, input.deletedAt, input.ownerTgUserId, input.id)
        .first<ScheduleRow>();

      return row ? toSchedule(row) : null;
    },

    async getSchedule(input) {
      const row = await db
        .prepare(
          `SELECT * FROM schedules
          WHERE owner_tg_user_id = ? AND id = ? AND deleted_at IS NULL`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<ScheduleRow>();

      return row ? toSchedule(row) : null;
    },

    async listSchedules(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM schedules
          WHERE owner_tg_user_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<ScheduleRow>();

      return (results ?? []).map(toSchedule);
    },

    async listDueSchedules(now, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM schedules
          WHERE enabled = 1
            AND deleted_at IS NULL
            AND next_run_at <= ?
          ORDER BY next_run_at ASC
          LIMIT ?`
        )
        .bind(now, limit)
        .all<ScheduleRow>();

      return (results ?? []).map(toSchedule);
    },

    async createScheduleExecution(input) {
      const row = await db
        .prepare(
          `INSERT OR IGNORE INTO schedule_executions (
            id, schedule_id, owner_tg_user_id, run_id, scheduled_for,
            status, output_text, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.scheduleId,
          input.ownerTgUserId,
          input.runId,
          input.scheduledFor,
          input.status,
          input.outputText,
          input.error,
          input.createdAt,
          input.updatedAt
        )
        .first<ScheduleExecutionRow>();

      return row ? toScheduleExecution(row) : null;
    },

    async updateScheduleExecution(input) {
      await db
        .prepare(
          `UPDATE schedule_executions
          SET run_id = COALESCE(?, run_id),
            status = ?,
            output_text = ?,
            error = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .bind(
          input.runId ?? null,
          input.status,
          input.outputText ?? null,
          input.error ?? null,
          input.updatedAt,
          input.id
        )
        .run();
    },

    async markScheduleExecuted(input) {
      await db
        .prepare(
          `UPDATE schedules
          SET last_run_at = ?, next_run_at = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(input.lastRunAt, input.nextRunAt, input.updatedAt, input.id)
        .run();
    },

    async listScheduleExecutions(input) {
      const { results } = input.scheduleId
        ? await db
            .prepare(
              `SELECT * FROM schedule_executions
              WHERE owner_tg_user_id = ? AND schedule_id = ?
              ORDER BY created_at DESC
              LIMIT ?`
            )
            .bind(input.ownerTgUserId, input.scheduleId, input.limit)
            .all<ScheduleExecutionRow>()
        : await db
            .prepare(
              `SELECT * FROM schedule_executions
              WHERE owner_tg_user_id = ?
              ORDER BY created_at DESC
              LIMIT ?`
            )
            .bind(input.ownerTgUserId, input.limit)
            .all<ScheduleExecutionRow>();

      return (results ?? []).map(toScheduleExecution);
    }
  };
}
