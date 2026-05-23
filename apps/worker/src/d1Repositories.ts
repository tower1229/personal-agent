import {
  type ApprovalRequestStatus,
  type MemoryStatus,
  type RunStatus,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel
} from "@personal-agent/shared";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
  type TodoRecord,
  type ToolCallRecord
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
    }
  };
}
