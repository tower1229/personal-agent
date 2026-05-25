import {
  escapeLike,
  toApproval,
  toMemory,
  toRun,
  toSchedule,
  toScheduleExecution,
  toSkill,
  toSkillRouteDecision,
  toSkillRun,
  toSkillVersion,
  toTodo,
  toToolCall,
  toWorkflowRun,
  toWorkflowStep,
  type ApprovalRequestRow,
  type MemoryRow,
  type RunRow,
  type ScheduleExecutionRow,
  type ScheduleRow,
  type SkillRouteDecisionRow,
  type SkillRow,
  type SkillRunRow,
  type SkillVersionRow,
  type TodoRow,
  type ToolCallRow,
  type WorkflowRunRow,
  type WorkflowStepRow
} from "./mappers.js";
import { type AgentRepositories, type RunnableSkillRecord } from "../../repositories.js";

export function createD1WorkflowRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createWorkflowRun"
  | "updateWorkflowRun"
  | "getWorkflowRun"
  | "listWorkflowRuns"
  | "getWorkflowRunForRun"
  | "createWorkflowStep"
  | "updateWorkflowStep"
  | "listWorkflowSteps"
> {
  return {
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

    async getWorkflowRunForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM workflow_runs
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<WorkflowRunRow>();

      return row ? toWorkflowRun(row) : null;
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

  };
}
