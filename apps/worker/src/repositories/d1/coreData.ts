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
  | "pollDueTodos"
  | "markTodoReminded"
  | "listTodos"
  | "completeTodo"
  | "updateTodo"
  | "deleteTodo"
  | "createMemory"
  | "searchMemories"
  | "getActiveMemory"
  | "listMemories"
  | "updateMemory"
  | "markMemoryDeleted"
  | "recordMemoryEvent"
  | "createApproval"
  | "findPendingApprovalByCode"
  | "updateApprovalStatus"
  | "listApprovals"
  | "getUserProfile"
  | "upsertUserProfile"
> {
  return {
    async createTodo(input) {
      const row = await db
        .prepare(
          `INSERT INTO todos (
            owner_tg_user_id, title, status, created_at, completed_at, due_at, reminded_at
          ) VALUES (?, ?, 'open', ?, NULL, ?, NULL)
          RETURNING *`
        )
        .bind(input.ownerTgUserId, input.title, input.createdAt, input.dueAt ?? null)
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

    async pollDueTodos(now, advanceThreshold) {
      const { results } = await db
        .prepare(
          `SELECT * FROM todos
          WHERE status = 'open'
            AND reminded_at IS NULL
            AND due_at IS NOT NULL
            AND due_at <= ?
          ORDER BY due_at ASC`
        )
        .bind(now + advanceThreshold)
        .all<TodoRow>();

      return (results ?? []).map(toTodo);
    },

    async markTodoReminded(id, remindedAt) {
      await db
        .prepare(
          `UPDATE todos
          SET reminded_at = ?
          WHERE id = ?`
        )
        .bind(remindedAt, id)
        .run();
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

    async updateTodo(input) {
      const existing = await db
        .prepare(`SELECT * FROM todos WHERE owner_tg_user_id = ? AND id = ?`)
        .bind(input.ownerTgUserId, input.id)
        .first<TodoRow>();

      if (!existing) {
        return null;
      }

      let completedAt = existing.completed_at;
      if (input.status === "completed" && existing.status !== "completed") {
        completedAt = input.now;
      } else if (input.status === "open" && existing.status === "completed") {
        completedAt = null;
      }

      let remindedAt = existing.reminded_at;
      if (
        input.dueAt !== existing.due_at ||
        (input.status === "open" &&
          existing.status === "completed" &&
          input.dueAt &&
          input.dueAt > input.now)
      ) {
        remindedAt = null;
      }

      const row = await db
        .prepare(
          `UPDATE todos
          SET title = ?, status = ?, completed_at = ?, due_at = ?, reminded_at = ?
          WHERE owner_tg_user_id = ? AND id = ?
          RETURNING *`
        )
        .bind(
          input.title,
          input.status,
          completedAt,
          input.dueAt,
          remindedAt,
          input.ownerTgUserId,
          input.id
        )
        .first<TodoRow>();

      return row ? toTodo(row) : null;
    },

    async deleteTodo(input) {
      const result = await db
        .prepare(`DELETE FROM todos WHERE owner_tg_user_id = ? AND id = ?`)
        .bind(input.ownerTgUserId, input.id)
        .run();
      return (result.meta.changes ?? 0) > 0;
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

    async updateMemory(input) {
      const row = await db
        .prepare(
          `UPDATE memories
          SET content = ?, normalized_content = ?
          WHERE owner_tg_user_id = ? AND id = ? AND status = 'active'
          RETURNING *`
        )
        .bind(input.content, input.normalizedContent, input.ownerTgUserId, input.id)
        .first<MemoryRow>();

      return row ? toMemory(row) : null;
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

    async getUserProfile(id) {
      const row = await db
        .prepare(`SELECT * FROM user_profiles WHERE id = ?`)
        .bind(id)
        .first<{
          id: string;
          name: string;
          birthday_timestamp: number | null;
          gender: string | null;
          interpretation_framework: string | null;
          preferences: string | null;
          agent_soul: string | null;
          core_memory: string | null;
          created_at: number;
          updated_at: number;
        }>();
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        birthdayTimestamp: row.birthday_timestamp,
        gender: row.gender,
        interpretationFramework: row.interpretation_framework,
        preferences: row.preferences,
        agentSoul: row.agent_soul,
        coreMemory: row.core_memory,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },

    async upsertUserProfile(input) {
      await db
        .prepare(
          `INSERT INTO user_profiles (id, name, birthday_timestamp, gender, interpretation_framework, preferences, agent_soul, core_memory, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             name = excluded.name,
             birthday_timestamp = excluded.birthday_timestamp,
             gender = excluded.gender,
             interpretation_framework = excluded.interpretation_framework,
             preferences = excluded.preferences,
             agent_soul = excluded.agent_soul,
             core_memory = excluded.core_memory,
             updated_at = excluded.updated_at`
        )
        .bind(
          input.id,
          input.name,
          input.birthdayTimestamp,
          input.gender,
          input.interpretationFramework,
          input.preferences,
          input.agentSoul,
          input.coreMemory,
          input.createdAt,
          input.updatedAt
        )
        .run();
      return input;
    }
  };
}
