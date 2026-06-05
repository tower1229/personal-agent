import type { D1Database } from "@cloudflare/workers-types";
import type { TaskRecord } from "../../repositories";
import { type TaskRow, mapTaskRecordToRow, mapTaskRowToRecord } from "./mappers";

export function createD1TaskRepository(db: D1Database) {
  return {
    async createTask(
      input: Omit<TaskRecord, "status" | "createdAt" | "updatedAt" | "completedAt"> & {
        status: TaskRecord["status"];
        createdAt: number;
        updatedAt: number;
      }
    ): Promise<TaskRecord> {
      const record: TaskRecord = {
        ...input,
        completedAt: null
      };

      const row = mapTaskRecordToRow(record);

      await db
        .prepare(
          `INSERT INTO tasks (
            id, owner_tg_user_id, type, status, title, command,
            context_json, result_json, error, run_id, created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.owner_tg_user_id,
          row.type,
          row.status,
          row.title,
          row.command,
          row.context_json,
          row.result_json,
          row.error,
          row.run_id,
          row.created_at,
          row.updated_at,
          row.completed_at
        )
        .run();

      return record;
    },

    async updateTask(input: {
      ownerTgUserId: number;
      id: string;
      patch: Partial<Pick<TaskRecord, "status" | "resultJson" | "error" | "runId" | "completedAt">>;
      updatedAt: number;
    }): Promise<TaskRecord | null> {
      const existingRow = await db
        .prepare(`SELECT * FROM tasks WHERE id = ? AND owner_tg_user_id = ?`)
        .bind(input.id, input.ownerTgUserId)
        .first<TaskRow>();

      if (!existingRow) {
        return null;
      }

      const existingRecord = mapTaskRowToRecord(existingRow);
      const updatedRecord: TaskRecord = {
        ...existingRecord,
        ...input.patch,
        updatedAt: input.updatedAt
      };

      const updatedRow = mapTaskRecordToRow(updatedRecord);

      await db
        .prepare(
          `UPDATE tasks SET
            status = ?, result_json = ?, error = ?, run_id = ?, updated_at = ?, completed_at = ?
          WHERE id = ? AND owner_tg_user_id = ?`
        )
        .bind(
          updatedRow.status,
          updatedRow.result_json,
          updatedRow.error,
          updatedRow.run_id,
          updatedRow.updated_at,
          updatedRow.completed_at,
          input.id,
          input.ownerTgUserId
        )
        .run();

      return updatedRecord;
    },

    async getTask(input: {
      ownerTgUserId: number;
      id: string;
    }): Promise<TaskRecord | null> {
      const row = await db
        .prepare(`SELECT * FROM tasks WHERE id = ? AND owner_tg_user_id = ?`)
        .bind(input.id, input.ownerTgUserId)
        .first<TaskRow>();

      return row ? mapTaskRowToRecord(row) : null;
    },

    async listTasks(input: {
      ownerTgUserId: number;
      limit: number;
      status?: TaskRecord["status"];
    }): Promise<TaskRecord[]> {
      let query = `SELECT * FROM tasks WHERE owner_tg_user_id = ?`;
      const binds: any[] = [input.ownerTgUserId];

      if (input.status) {
        query += ` AND status = ?`;
        binds.push(input.status);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      binds.push(input.limit);

      const result = await db.prepare(query).bind(...binds).all<TaskRow>();

      return result.results.map(mapTaskRowToRecord);
    },

    async deleteTask(input: {
      ownerTgUserId: number;
      id: string;
    }): Promise<boolean> {
      const result = await db
        .prepare(`DELETE FROM tasks WHERE id = ? AND owner_tg_user_id = ?`)
        .bind(input.id, input.ownerTgUserId)
        .run();

      return (result.meta.changes ?? 0) > 0;
    }
  };
}
