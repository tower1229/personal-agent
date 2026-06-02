import {
  toLongTask,
  toLongTaskEvent,
  toLongTaskStep,
  type LongTaskEventRow,
  type LongTaskRow,
  type LongTaskStepRow
} from "./mappers.js";
import { type AgentRepositories } from "../../repositories.js";

export function createD1LongTaskRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createLongTask"
  | "updateLongTask"
  | "getLongTask"
  | "getLatestActiveLongTask"
  | "getLongTaskForRun"
  | "listLongTasks"
  | "listResumableLongTasks"
  | "createLongTaskStep"
  | "updateLongTaskStep"
  | "claimNextLongTaskStep"
  | "listLongTaskSteps"
  | "createLongTaskEvent"
  | "listLongTaskEvents"
> {
  return {
    async createLongTask(input) {
      const row = await db
        .prepare(
          `INSERT INTO long_tasks (
            id, run_id, owner_tg_user_id, title, original_input, status,
            complexity_score, planner_reason, current_step_id, output_text,
            error, replan_count, telegram_chat_id, telegram_message_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.runId,
          input.ownerTgUserId,
          input.title,
          input.originalInput,
          input.status,
          input.complexityScore,
          input.plannerReason,
          input.currentStepId,
          input.outputText,
          input.error,
          input.replanCount,
          input.telegramChatId,
          input.telegramMessageId,
          input.createdAt,
          input.updatedAt
        )
        .first<LongTaskRow>();

      if (!row) {
        throw new Error("Failed to create long task");
      }

      return toLongTask(row);
    },

    async updateLongTask(input) {
      await db
        .prepare(
          `UPDATE long_tasks
          SET status = ?,
            title = COALESCE(?, title),
            planner_reason = COALESCE(?, planner_reason),
            current_step_id = CASE WHEN ? THEN ? ELSE current_step_id END,
            output_text = CASE WHEN ? THEN ? ELSE output_text END,
            error = CASE WHEN ? THEN ? ELSE error END,
            replan_count = COALESCE(?, replan_count),
            telegram_chat_id = CASE WHEN ? THEN ? ELSE telegram_chat_id END,
            telegram_message_id = CASE WHEN ? THEN ? ELSE telegram_message_id END,
            updated_at = ?
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.title ?? null,
          input.plannerReason ?? null,
          input.currentStepId === undefined ? 0 : 1,
          input.currentStepId ?? null,
          input.outputText === undefined ? 0 : 1,
          input.outputText ?? null,
          input.error === undefined ? 0 : 1,
          input.error ?? null,
          input.replanCount ?? null,
          input.telegramChatId === undefined ? 0 : 1,
          input.telegramChatId ?? null,
          input.telegramMessageId === undefined ? 0 : 1,
          input.telegramMessageId ?? null,
          input.updatedAt,
          input.id
        )
        .run();
    },

    async getLongTask(input) {
      const row = await db
        .prepare(
          `SELECT * FROM long_tasks
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<LongTaskRow>();

      return row ? toLongTask(row) : null;
    },

    async getLatestActiveLongTask(ownerTgUserId) {
      const row = await db
        .prepare(
          `SELECT * FROM long_tasks
          WHERE owner_tg_user_id = ?
            AND status IN ('planning', 'running', 'waiting_for_user', 'paused')
          ORDER BY updated_at DESC
          LIMIT 1`
        )
        .bind(ownerTgUserId)
        .first<LongTaskRow>();

      return row ? toLongTask(row) : null;
    },

    async getLongTaskForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM long_tasks
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<LongTaskRow>();

      return row ? toLongTask(row) : null;
    },

    async listLongTasks(ownerTgUserId, limit) {
      const { results } = await db
        .prepare(
          `SELECT * FROM long_tasks
          WHERE owner_tg_user_id = ?
          ORDER BY updated_at DESC
          LIMIT ?`
        )
        .bind(ownerTgUserId, limit)
        .all<LongTaskRow>();

      return (results ?? []).map(toLongTask);
    },

    async listResumableLongTasks(now, limit) {
      const staleBefore = now - 30000;
      const { results } = await db
        .prepare(
          `SELECT * FROM long_tasks
          WHERE status = 'running' AND updated_at <= ?
          ORDER BY updated_at ASC
          LIMIT ?`
        )
        .bind(staleBefore, limit)
        .all<LongTaskRow>();

      return (results ?? []).map(toLongTask);
    },

    async createLongTaskStep(input) {
      const row = await db
        .prepare(
          `INSERT INTO long_task_steps (
            id, long_task_id, owner_tg_user_id, position, title, description,
            status, tool_policy, success_criteria, input_json, output_json,
            error, started_at, completed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.longTaskId,
          input.ownerTgUserId,
          input.position,
          input.title,
          input.description,
          input.status,
          input.toolPolicy,
          input.successCriteria,
          input.inputJson,
          input.outputJson,
          input.error,
          input.startedAt,
          input.completedAt,
          input.createdAt
        )
        .first<LongTaskStepRow>();

      if (!row) {
        throw new Error("Failed to create long task step");
      }

      return toLongTaskStep(row);
    },

    async updateLongTaskStep(input) {
      await db
        .prepare(
          `UPDATE long_task_steps
          SET status = ?,
            output_json = CASE WHEN ? THEN ? ELSE output_json END,
            error = CASE WHEN ? THEN ? ELSE error END,
            started_at = COALESCE(?, started_at),
            completed_at = CASE WHEN ? THEN ? ELSE completed_at END
          WHERE id = ?`
        )
        .bind(
          input.status,
          input.outputJson === undefined ? 0 : 1,
          input.outputJson ?? null,
          input.error === undefined ? 0 : 1,
          input.error ?? null,
          input.startedAt ?? null,
          input.completedAt === undefined ? 0 : 1,
          input.completedAt ?? null,
          input.id
        )
        .run();
    },

    async claimNextLongTaskStep(input) {
      const pending = await db
        .prepare(
          `SELECT * FROM long_task_steps
          WHERE long_task_id = ? AND status = 'pending'
          ORDER BY position ASC
          LIMIT 1`
        )
        .bind(input.longTaskId)
        .first<LongTaskStepRow>();

      if (!pending) {
        return null;
      }

      const row = await db
        .prepare(
          `UPDATE long_task_steps
          SET status = 'running', started_at = ?
          WHERE id = ? AND status = 'pending'
          RETURNING *`
        )
        .bind(input.startedAt, pending.id)
        .first<LongTaskStepRow>();

      return row ? toLongTaskStep(row) : null;
    },

    async listLongTaskSteps(longTaskId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM long_task_steps
          WHERE long_task_id = ?
          ORDER BY position ASC`
        )
        .bind(longTaskId)
        .all<LongTaskStepRow>();

      return (results ?? []).map(toLongTaskStep);
    },

    async createLongTaskEvent(input) {
      const row = await db
        .prepare(
          `INSERT INTO long_task_events (
            id, long_task_id, owner_tg_user_id, step_id, event_type,
            payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *`
        )
        .bind(
          input.id,
          input.longTaskId,
          input.ownerTgUserId,
          input.stepId,
          input.eventType,
          input.payloadJson,
          input.createdAt
        )
        .first<LongTaskEventRow>();

      if (!row) {
        throw new Error("Failed to create long task event");
      }

      return toLongTaskEvent(row);
    },

    async listLongTaskEvents(longTaskId) {
      const { results } = await db
        .prepare(
          `SELECT * FROM long_task_events
          WHERE long_task_id = ?
          ORDER BY created_at ASC`
        )
        .bind(longTaskId)
        .all<LongTaskEventRow>();

      return (results ?? []).map(toLongTaskEvent);
    }
  };
}
