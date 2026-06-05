import { type AgentRepositories } from "../../repositories.js";
import {
  toRun,
  toRunEvaluation,
  toRunFeedback,
  toToolCall,
  type RunEvaluationRow,
  type RunFeedbackRow,
  type RunRow,
  type ToolCallRow
} from "./mappers.js";

export function createD1RunRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createRun"
  | "updateRun"
  | "listRuns"
  | "listRunsForSession"
  | "listUnextractedRuns"
  | "getRun"
  | "recordToolCall"
  | "listToolCallsForRun"
  | "createRunFeedback"
  | "listRunFeedbacks"
  | "createRunEvaluation"
  | "listRunEvaluations"
> {
  return {
    async createRun(input) {
      const row = await db
        .prepare(
          `INSERT INTO runs (
            id, session_id, owner_tg_user_id, chat_id, update_id, message_text,
            status, response_text, error, context_trace_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'running', NULL, NULL, NULL, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.sessionId,
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
      const updates: string[] = [];
      const bindings: any[] = [];
      
      if (patch.status !== undefined) {
        updates.push("status = ?");
        bindings.push(patch.status);
      }
      if (patch.responseText !== undefined) {
        updates.push("response_text = ?");
        bindings.push(patch.responseText);
      }
      if (patch.error !== undefined) {
        updates.push("error = ?");
        bindings.push(patch.error);
      }
      if (patch.contextTraceJson !== undefined) {
        updates.push("context_trace_json = ?");
        bindings.push(patch.contextTraceJson);
      }
      
      updates.push("updated_at = ?");
      bindings.push(patch.updatedAt);
      
      bindings.push(id);

      await db
        .prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...bindings)
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

    async listRunsForSession(ownerTgUserId, sessionId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM runs
          WHERE owner_tg_user_id = ? AND session_id = ?
          ORDER BY created_at ASC`
        )
        .bind(ownerTgUserId, sessionId)
        .all<RunRow>();

      return (results ?? []).map(toRun);
    },

    async listUnextractedRuns(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM runs
          WHERE owner_tg_user_id = ? 
            AND created_at > ? 
            AND created_at <= ?
          ORDER BY created_at ASC
          LIMIT ?`
        )
        .bind(input.ownerTgUserId, input.cursorMs, input.endMs, input.limit)
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

    async createRunFeedback(input) {
      const row = await db
        .prepare(
          `INSERT INTO run_feedbacks (
            id, run_id, owner_tg_user_id, feedback_type, comment, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.feedbackType,
          input.comment,
          input.createdAt
        )
        .first<RunFeedbackRow>();
      if (!row) throw new Error("Failed to create run feedback");
      return toRunFeedback(row);
    },

    async listRunFeedbacks(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM run_feedbacks
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`
        )
        .bind(input.ownerTgUserId, input.limit, input.offset)
        .all<RunFeedbackRow>();
      return (results ?? []).map(toRunFeedback);
    },

    async createRunEvaluation(input) {
      const row = await db
        .prepare(
          `INSERT INTO run_evaluations (
            id, run_id, owner_tg_user_id, groundedness_score, old_data_misuse_score,
            advice_fit_score, emotional_calibration_score, reasoning, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.groundednessScore,
          input.oldDataMisuseScore,
          input.adviceFitScore,
          input.emotionalCalibrationScore,
          input.reasoning,
          input.createdAt
        )
        .first<RunEvaluationRow>();
      if (!row) throw new Error("Failed to create run evaluation");
      return toRunEvaluation(row);
    },

    async listRunEvaluations(input) {
      const { results } = await db
        .prepare(
          `SELECT * FROM run_evaluations
          WHERE owner_tg_user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`
        )
        .bind(input.ownerTgUserId, input.limit, input.offset)
        .all<RunEvaluationRow>();
      return (results ?? []).map(toRunEvaluation);
    },

  };
}
