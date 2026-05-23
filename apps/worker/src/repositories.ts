import {
  type ApprovalRequestStatus,
  type MemoryStatus,
  type RunStatus,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel
} from "@personal-agent/shared";

export interface RunRecord {
  id: string;
  ownerTgUserId: number;
  chatId: number;
  updateId: number | null;
  messageText: string | null;
  status: RunStatus;
  responseText: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCallRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  toolName: string;
  riskLevel: ToolRiskLevel;
  status: ToolCallStatus;
  inputJson: string;
  outputJson: string | null;
  error: string | null;
  createdAt: number;
}

export interface TodoRecord {
  id: number;
  ownerTgUserId: number;
  title: string;
  status: TodoStatus;
  createdAt: number;
  completedAt: number | null;
}

export interface MemoryRecord {
  id: number;
  ownerTgUserId: number;
  content: string;
  normalizedContent: string;
  status: MemoryStatus;
  createdAt: number;
  deletedAt: number | null;
}

export interface ApprovalRequestRecord {
  id: string;
  ownerTgUserId: number;
  action: string;
  payloadJson: string;
  status: ApprovalRequestStatus;
  code: string;
  createdAt: number;
  decidedAt: number | null;
}

export interface AgentRepositories {
  createRun(input: Omit<RunRecord, "status" | "responseText" | "error">): Promise<RunRecord>;
  updateRun(
    id: string,
    patch: {
      status: RunStatus;
      responseText?: string | null;
      error?: string | null;
      updatedAt: number;
    }
  ): Promise<void>;
  listRuns(ownerTgUserId: number, limit: number): Promise<RunRecord[]>;
  recordToolCall(input: ToolCallRecord): Promise<void>;
  createTodo(input: {
    ownerTgUserId: number;
    title: string;
    createdAt: number;
  }): Promise<TodoRecord>;
  listOpenTodos(ownerTgUserId: number, limit: number): Promise<TodoRecord[]>;
  listTodos(ownerTgUserId: number, limit: number): Promise<TodoRecord[]>;
  completeTodo(input: {
    ownerTgUserId: number;
    id: number;
    completedAt: number;
  }): Promise<TodoRecord | null>;
  createMemory(input: {
    ownerTgUserId: number;
    content: string;
    normalizedContent: string;
    createdAt: number;
  }): Promise<MemoryRecord>;
  searchMemories(input: {
    ownerTgUserId: number;
    keyword: string;
    limit: number;
  }): Promise<MemoryRecord[]>;
  getActiveMemory(input: {
    ownerTgUserId: number;
    id: number;
  }): Promise<MemoryRecord | null>;
  listMemories(ownerTgUserId: number, limit: number): Promise<MemoryRecord[]>;
  markMemoryDeleted(input: {
    ownerTgUserId: number;
    id: number;
    deletedAt: number;
  }): Promise<MemoryRecord | null>;
  recordMemoryEvent(input: {
    memoryId: number;
    ownerTgUserId: number;
    eventType: string;
    payload: unknown;
    createdAt: number;
  }): Promise<void>;
  createApproval(input: ApprovalRequestRecord): Promise<ApprovalRequestRecord>;
  findPendingApprovalByCode(input: {
    ownerTgUserId: number;
    code: string;
  }): Promise<ApprovalRequestRecord | null>;
  updateApprovalStatus(input: {
    id: string;
    status: ApprovalRequestStatus;
    decidedAt: number;
  }): Promise<void>;
  listApprovals(
    ownerTgUserId: number,
    limit: number
  ): Promise<ApprovalRequestRecord[]>;
}
