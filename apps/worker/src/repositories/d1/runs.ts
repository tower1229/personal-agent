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
  type ToolCallRow
} from "./mappers.js";
import { type AgentRepositories, type RunnableSkillRecord } from "../../repositories.js";

export function createD1RunRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createRun"
  | "updateRun"
  | "listRuns"
  | "getRun"
  | "recordToolCall"
  | "listToolCallsForRun"
> {
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

    async getRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM runs
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<RunRow>();

      return row ? toRun(row) : null;
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

    async listToolCallsForRun(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM tool_calls
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at ASC`
        )
        .bind(input.ownerTgUserId, input.runId)
        .all<ToolCallRow>();

      return (results ?? []).map(toToolCall);
    },

  };
}
