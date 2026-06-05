import { type AgentRepositories } from "../../repositories.js";
import {
  toSchedule,
  toScheduleExecution,
  type ScheduleExecutionRow,
  type ScheduleRow
} from "./mappers.js";

export function createD1ScheduleRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createSchedule"
  | "updateSchedule"
  | "setScheduleEnabled"
  | "softDeleteSchedule"
  | "getSchedule"
  | "listSchedules"
  | "listDueSchedules"
  | "createScheduleExecution"
  | "updateScheduleExecution"
  | "markScheduleExecuted"
  | "listScheduleExecutions"
  | "getScheduleExecutionForRun"
> {
  return {
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

      if (row) {
        return toSchedule(row);
      }

      const existing = await db
        .prepare(
          `SELECT * FROM schedules
          WHERE owner_tg_user_id = ? AND id = ?`
        )
        .bind(input.ownerTgUserId, input.id)
        .first<ScheduleRow>();

      return existing && existing.deleted_at !== null ? toSchedule(existing) : null;
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
    },

    async getScheduleExecutionForRun(input) {
      const row = await db
        .prepare(
          `SELECT * FROM schedule_executions
          WHERE owner_tg_user_id = ? AND run_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
        )
        .bind(input.ownerTgUserId, input.runId)
        .first<ScheduleExecutionRow>();

      return row ? toScheduleExecution(row) : null;
    }
  };
}
