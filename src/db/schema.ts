import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runStatuses = ["running", "succeeded", "failed"] as const;
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
  "searched",
  "duplicate_detected",
  "merged",
  "superseded",
  "archived",
  "accessed",
  "conflict_detected"
] as const;
export type MemoryEventType = (typeof memoryEventTypes)[number];

export const memoryStatuses = ["active", "archived", "deleted"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export const approvalRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "executed",
  "expired"
] as const;
export type ApprovalRequestStatus =
  (typeof approvalRequestStatuses)[number];

export const documentSourceTypes = ["text", "markdown"] as const;
export type DocumentSourceType = (typeof documentSourceTypes)[number];

export const workflowTypes = ["daily_brief"] as const;
export type WorkflowType = (typeof workflowTypes)[number];

export const workflowStatuses = ["running", "succeeded", "failed"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const workflowStepStatuses = [
  "running",
  "succeeded",
  "failed",
  "skipped"
] as const;
export type WorkflowStepStatus = (typeof workflowStepStatuses)[number];

export const evalCategories = [
  "casual_chat",
  "todo_create",
  "todo_list",
  "todo_complete",
  "memory_save",
  "memory_search",
  "memory_delete_approval",
  "document_add",
  "document_search",
  "document_no_evidence",
  "daily_brief",
  "safety",
  "approval",
  "tool_error_recovery"
] as const;
export type EvalCategory = (typeof evalCategories)[number];

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
  normalizedContent: text("normalized_content"),
  canonicalKey: text("canonical_key"),
  status: text("status", { enum: memoryStatuses }).notNull().default("active"),
  confidence: integer("confidence").notNull().default(80),
  importance: integer("importance").notNull().default(50),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp_ms" }),
  accessCount: integer("access_count").notNull().default(0),
  supersededByMemoryId: integer("superseded_by_memory_id")
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

export const memoryEmbeddings = sqliteTable("memory_embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memoryId: integer("memory_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  embeddingJson: text("embedding_json").notNull(),
  dimensions: integer("dimensions").notNull(),
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
  riskLevel: text("risk_level"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  operationSummaryJson: text("operation_summary_json"),
  approvalCode: text("approval_code"),
  executedToolCallId: integer("executed_tool_call_id"),
  status: text("status", { enum: approvalRequestStatuses }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" })
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type", { enum: documentSourceTypes }).notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const documentChunks = sqliteTable("document_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull(),
  userId: text("user_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const documentChunkEmbeddings = sqliteTable("document_chunk_embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentChunkId: integer("document_chunk_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  embeddingJson: text("embedding_json").notNull(),
  dimensions: integer("dimensions").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const workflows = sqliteTable("workflows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  runId: integer("run_id"),
  type: text("type", { enum: workflowTypes }).notNull(),
  status: text("status", { enum: workflowStatuses }).notNull(),
  inputJson: text("input_json").notNull(),
  outputJson: text("output_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const workflowSteps = sqliteTable("workflow_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowId: integer("workflow_id").notNull(),
  stepName: text("step_name").notNull(),
  status: text("status", { enum: workflowStepStatuses }).notNull(),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" })
});

export const evalRuns = sqliteTable("eval_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  total: integer("total").notNull(),
  passed: integer("passed").notNull(),
  failed: integer("failed").notNull(),
  passRate: integer("pass_rate").notNull()
});

export const evalResults = sqliteTable("eval_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evalRunId: integer("eval_run_id").notNull(),
  caseId: text("case_id").notNull(),
  category: text("category", { enum: evalCategories }).notNull(),
  input: text("input").notNull(),
  output: text("output").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull(),
  scoreJson: text("score_json").notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
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
export type MemoryEmbedding = typeof memoryEmbeddings.$inferSelect;
export type NewMemoryEmbedding = typeof memoryEmbeddings.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type DocumentChunkEmbedding = typeof documentChunkEmbeddings.$inferSelect;
export type NewDocumentChunkEmbedding = typeof documentChunkEmbeddings.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;
export type EvalRun = typeof evalRuns.$inferSelect;
export type NewEvalRun = typeof evalRuns.$inferInsert;
export type EvalResult = typeof evalResults.$inferSelect;
export type NewEvalResult = typeof evalResults.$inferInsert;
