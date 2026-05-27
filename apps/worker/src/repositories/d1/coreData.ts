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

export function createD1CoreDataRepositories(
  db: D1Database
): Pick<
  AgentRepositories,
  | "createTodo"
  | "listOpenTodos"
  | "listTodos"
  | "completeTodo"
  | "createMemory"
  | "searchMemories"
  | "getActiveMemory"
  | "listMemories"
  | "markMemoryDeleted"
  | "recordMemoryEvent"
  | "createApproval"
  | "findPendingApprovalByCode"
  | "updateApprovalStatus"
  | "listApprovals"
> {
  return {
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

  };
}
