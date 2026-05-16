import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runStatuses = ["succeeded", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const todoStatuses = ["open", "completed"] as const;
export type TodoStatus = (typeof todoStatuses)[number];

export const toolCallStatuses = ["succeeded", "failed"] as const;
export type ToolCallStatus = (typeof toolCallStatuses)[number];

export const memoryTypes = [
  "profile",
  "preference",
  "fact",
  "project",
  "note"
] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const memoryEventTypes = [
  "created",
  "updated",
  "deleted",
  "searched"
] as const;
export type MemoryEventType = (typeof memoryEventTypes)[number];

export const approvalRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "executed",
  "expired"
] as const;
export type ApprovalRequestStatus =
  (typeof approvalRequestStatuses)[number];

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  chatId: text("chat_id").notNull(),
  model: text("model").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  status: text("status", { enum: runStatuses }).notNull(),
  latencyMs: integer("latency_ms").notNull(),
  error: text("error"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: todoStatuses }).notNull(),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" })
});

export const toolCalls = sqliteTable("tool_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id"),
  userId: text("user_id").notNull(),
  chatId: text("chat_id").notNull(),
  toolName: text("tool_name").notNull(),
  argsJson: text("args_json").notNull(),
  resultJson: text("result_json"),
  status: text("status", { enum: toolCallStatuses }).notNull(),
  error: text("error"),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const memories = sqliteTable("memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  type: text("type", { enum: memoryTypes }).notNull(),
  content: text("content").notNull(),
  confidence: integer("confidence").notNull().default(80),
  importance: integer("importance").notNull().default(50),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const memoryEvents = sqliteTable("memory_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memoryId: integer("memory_id"),
  userId: text("user_id").notNull(),
  eventType: text("event_type", { enum: memoryEventTypes }).notNull(),
  sourceRunId: integer("source_run_id"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const approvalRequests = sqliteTable("approval_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  chatId: text("chat_id").notNull(),
  runId: integer("run_id"),
  toolName: text("tool_name").notNull(),
  toolArgsJson: text("tool_args_json").notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: approvalRequestStatuses }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" })
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type MemoryEvent = typeof memoryEvents.$inferSelect;
export type NewMemoryEvent = typeof memoryEvents.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
