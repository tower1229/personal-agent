import {
  type ApprovalRequestStatus,
  type MemoryStatus,
  type RunStatus,
  type SkillManifest,
  type SkillRouteTriggerType,
  type SkillRunStatus,
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

export interface SkillRecord {
  id: string;
  ownerTgUserId: number;
  draftManifest: SkillManifest;
  enabled: boolean;
  deletedAt: number | null;
  publishedVersionId: string | null;
  publishedVersion: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  ownerTgUserId: number;
  version: number;
  manifest: SkillManifest;
  createdAt: number;
}

export interface RunnableSkillRecord {
  skill: SkillRecord;
  version: SkillVersionRecord;
}

export interface SkillRouteDecisionRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  inputText: string;
  triggerType: SkillRouteTriggerType;
  matchedSkillId: string | null;
  matchedSkillVersionId: string | null;
  confidence: number | null;
  reason: string;
  createdAt: number;
}

export interface SkillRunRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  skillId: string;
  skillVersionId: string;
  status: SkillRunStatus;
  inputText: string;
  outputText: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
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
  createSkill(input: {
    ownerTgUserId: number;
    manifest: SkillManifest;
    createdAt: number;
  }): Promise<SkillRecord>;
  updateSkillDraft(input: {
    ownerTgUserId: number;
    id: string;
    manifest: SkillManifest;
    updatedAt: number;
  }): Promise<SkillRecord | null>;
  listSkills(ownerTgUserId: number, limit: number): Promise<SkillRecord[]>;
  getSkill(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<SkillRecord | null>;
  setSkillEnabled(input: {
    ownerTgUserId: number;
    id: string;
    enabled: boolean;
    updatedAt: number;
  }): Promise<SkillRecord | null>;
  softDeleteSkill(input: {
    ownerTgUserId: number;
    id: string;
    deletedAt: number;
  }): Promise<SkillRecord | null>;
  publishSkill(input: {
    ownerTgUserId: number;
    id: string;
    versionId: string;
    createdAt: number;
  }): Promise<SkillVersionRecord | null>;
  getRunnableSkillById(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<RunnableSkillRecord | null>;
  listRunnableSkills(ownerTgUserId: number): Promise<RunnableSkillRecord[]>;
  createSkillRouteDecision(
    input: SkillRouteDecisionRecord
  ): Promise<SkillRouteDecisionRecord>;
  listSkillRouteDecisions(
    ownerTgUserId: number,
    limit: number
  ): Promise<SkillRouteDecisionRecord[]>;
  createSkillRun(input: SkillRunRecord): Promise<SkillRunRecord>;
  updateSkillRun(input: {
    id: string;
    status: SkillRunStatus;
    outputText?: string | null;
    error?: string | null;
    updatedAt: number;
  }): Promise<void>;
  listSkillRuns(ownerTgUserId: number, limit: number): Promise<SkillRunRecord[]>;
}
