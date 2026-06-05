import { buildSessionCookie, signSession } from "../auth.js";
import { createWorkerApp } from "../app.js";
import { type SearchClient, type UrlFetcher } from "../externalTools.js";
import {
  type LlmChatCompletionOutput,
  type LlmClient,
  type LlmMessage,
} from "../llm.js";
import {
  type AgentRepositories,
  type AdminAssistRunRecord,
  type ApprovalRequestRecord,
  type LongTaskEventRecord,
  type LongTaskRecord,
  type LongTaskStepRecord,
  type MemoryRecord,
  type PersonalModelClaimRecord,
  type PersonalModelEvidenceRecord,
  type PersonalModelEventRecord,
  type PersonalModelMetacognitionLogRecord,
  type PersonalModelUnderstandingGapRecord,
  type PersonalModelSourceChunkRecord,
  type PersonalModelSourceDocumentRecord,
  type PendingPlannerRouteClarificationRecord,
  type PlannerRouteDecisionRecord,
  type RunRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type SkillRecord,
  type SkillIntentRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type SkillVersionRecord,
  type TodoRecord,
  type ToolCallRecord,
  type UserProfileRecord,
  type RunFeedbackRecord,
  type RunEvaluationRecord,
} from "../repositories.js";
import { type TelegramClient } from "../telegram.js";
import { type WorkerEnv } from "../types.js";
import { parseSkillPackageFiles } from "../skillPackages.js";
import { markSkillPackageNameConflict } from "../skillPackages.js";

export const env: WorkerEnv = {
  DB: {} as D1Database,
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_BOT_USERNAME: "personal_agent_bot",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
  OWNER_TG_USER_ID: "1229",
  ADMIN_SESSION_SECRET: "session-secret",
  LLM_API_BASE_URL: "https://llm.example",
  LLM_API_KEY: "llm-key",
  LLM_MODEL: "test-model",
  LLM_MAX_TOOL_ROUNDS: "3",
  BRAVE_SEARCH_API_KEY: "brave-key",
  FETCH_URL_MAX_BYTES: "200000",
};

export function ownerUpdate(text: string, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: {
        id: 1229,
        first_name: "Shixiong",
      },
      chat: {
        id: 1229,
      },
      text,
    },
  };
}

export function skillPackageFiles(input: {
  name: string;
  allowedTools?: string[];
  description?: string;
  instructions?: string;
}): Record<string, string> {
  const allowedTools = (input.allowedTools ?? [])
    .map((tool) => `  - ${tool}`)
    .join("\n");

  return {
    "SKILL.md": [
      "---",
      `name: ${input.name}`,
      `description: ${JSON.stringify(input.description ?? `${input.name} description`)}`,
      allowedTools ? "allowed-tools:" : "",
      allowedTools,
      "---",
      input.instructions ?? "用简洁中文回应。",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

export function createFakeRepositories(): AgentRepositories & {
  runs: RunRecord[];
  toolCalls: ToolCallRecord[];
  todos: TodoRecord[];
  memories: MemoryRecord[];
  personalModelClaims: PersonalModelClaimRecord[];
  personalModelEvents: PersonalModelEventRecord[];
  personalModelSourceDocuments: PersonalModelSourceDocumentRecord[];
  personalModelSourceChunks: PersonalModelSourceChunkRecord[];
  personalModelEvidence: PersonalModelEvidenceRecord[];
  personalModelMetacognitionLogs: PersonalModelMetacognitionLogRecord[];
  personalModelUnderstandingGaps: PersonalModelUnderstandingGapRecord[];
  approvals: ApprovalRequestRecord[];
  skills: SkillRecord[];
  skillVersions: SkillVersionRecord[];
  skillRouteDecisions: SkillRouteDecisionRecord[];
  plannerRouteDecisions: PlannerRouteDecisionRecord[];
  pendingPlannerRouteClarifications: PendingPlannerRouteClarificationRecord[];
  skillRuns: SkillRunRecord[];
  longTasks: LongTaskRecord[];
  longTaskSteps: LongTaskStepRecord[];
  longTaskEvents: LongTaskEventRecord[];
  schedules: ScheduleRecord[];
  scheduleExecutions: ScheduleExecutionRecord[];
  userProfiles: UserProfileRecord[];
  runFeedbacks: RunFeedbackRecord[];
  runEvaluations: RunEvaluationRecord[];
  adminAssistRuns: AdminAssistRunRecord[];
} {
  const state = {
    runs: [] as RunRecord[],
    toolCalls: [] as ToolCallRecord[],
    todos: [] as TodoRecord[],
    memories: [] as MemoryRecord[],
    personalModelClaims: [] as PersonalModelClaimRecord[],
    personalModelEvents: [] as PersonalModelEventRecord[],
    personalModelSourceDocuments: [] as PersonalModelSourceDocumentRecord[],
    personalModelSourceChunks: [] as PersonalModelSourceChunkRecord[],
    personalModelEvidence: [] as PersonalModelEvidenceRecord[],
    personalModelMetacognitionLogs: [] as PersonalModelMetacognitionLogRecord[],
    personalModelUnderstandingGaps: [] as PersonalModelUnderstandingGapRecord[],
    approvals: [] as ApprovalRequestRecord[],
    skills: [] as SkillRecord[],
    skillIntents: [] as SkillIntentRecord[],
    skillVersions: [] as SkillVersionRecord[],
    skillRouteDecisions: [] as SkillRouteDecisionRecord[],
    plannerRouteDecisions: [] as PlannerRouteDecisionRecord[],
    pendingPlannerRouteClarifications:
      [] as PendingPlannerRouteClarificationRecord[],
    skillRuns: [] as SkillRunRecord[],
    longTasks: [] as LongTaskRecord[],
    longTaskSteps: [] as LongTaskStepRecord[],
    longTaskEvents: [] as LongTaskEventRecord[],
    schedules: [] as ScheduleRecord[],
    scheduleExecutions: [] as ScheduleExecutionRecord[],
    userProfiles: [] as UserProfileRecord[],
    runFeedbacks: [] as RunFeedbackRecord[],
    runEvaluations: [] as RunEvaluationRecord[],
    adminAssistRuns: [] as AdminAssistRunRecord[],
    nextTodoId: 1,
    nextMemoryId: 1,
  };

  return {
    get userProfiles() {
      return state.userProfiles;
    },
    get runs() {
      return state.runs;
    },
    get toolCalls() {
      return state.toolCalls;
    },
    get todos() {
      return state.todos;
    },
    get memories() {
      return state.memories;
    },
    get personalModelClaims() {
      return state.personalModelClaims;
    },
    get personalModelEvents() {
      return state.personalModelEvents;
    },
    get personalModelSourceDocuments() {
      return state.personalModelSourceDocuments;
    },
    get personalModelSourceChunks() {
      return state.personalModelSourceChunks;
    },
    get personalModelEvidence() {
      return state.personalModelEvidence;
    },
    get personalModelMetacognitionLogs() {
      return state.personalModelMetacognitionLogs;
    },
    get personalModelUnderstandingGaps() {
      return state.personalModelUnderstandingGaps;
    },
    get approvals() {
      return state.approvals;
    },
    get skills() {
      return state.skills;
    },
    get skillVersions() {
      return state.skillVersions;
    },
    get skillRouteDecisions() {
      return state.skillRouteDecisions;
    },
    get plannerRouteDecisions() {
      return state.plannerRouteDecisions;
    },
    get pendingPlannerRouteClarifications() {
      return state.pendingPlannerRouteClarifications;
    },
    get skillRuns() {
      return state.skillRuns;
    },
    get longTasks() {
      return state.longTasks;
    },
    get longTaskSteps() {
      return state.longTaskSteps;
    },
    get longTaskEvents() {
      return state.longTaskEvents;
    },
    get schedules() {
      return state.schedules;
    },
    get scheduleExecutions() {
      return state.scheduleExecutions;
    },
    get runFeedbacks() {
      return state.runFeedbacks;
    },
    get runEvaluations() {
      return state.runEvaluations;
    },
    get adminAssistRuns() {
      return state.adminAssistRuns;
    },
    async createChatSession() {
      return {} as any;
    },
    async getActiveChatSession() {
      return null;
    },
    async closeActiveChatSession() {},
    async updateChatSession() {},
    async listRunsForSession() {
      return [];
    },
    async createRun(input) {
      const run: RunRecord = {
        ...input,
        sessionId: input.sessionId ?? null,
        status: "running",
        responseText: null,
        error: null,
        contextTraceJson: null,
      };
      state.runs.push(run);
      return run;
    },
    async updateRun(id, patch) {
      const run = state.runs.find((item) => item.id === id);
      if (!run) {
        return;
      }
      run.status = patch.status ?? run.status;
      run.responseText =
        patch.responseText !== undefined
          ? patch.responseText
          : run.responseText;
      run.error = patch.error !== undefined ? patch.error : run.error;
      if (patch.contextTraceJson !== undefined) {
        run.contextTraceJson = patch.contextTraceJson;
      }
      run.updatedAt = patch.updatedAt;
    },
    async listRuns(ownerTgUserId, limit) {
      return state.runs
        .filter((run) => run.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async getRun(input) {
      return (
        state.runs.find(
          (run) =>
            run.ownerTgUserId === input.ownerTgUserId && run.id === input.id,
        ) ?? null
      );
    },
    async recordToolCall(input) {
      state.toolCalls.push(input);
    },
    async listToolCallsForRun(input) {
      return state.toolCalls
        .filter(
          (toolCall) =>
            toolCall.ownerTgUserId === input.ownerTgUserId &&
            toolCall.runId === input.runId,
        )
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt);
    },
    async createRunFeedback(input) {
      state.runFeedbacks.push(input);
      return input;
    },
    async listRunFeedbacks(input) {
      return state.runFeedbacks
        .filter((fb) => fb.ownerTgUserId === input.ownerTgUserId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(input.offset, input.offset + input.limit);
    },
    async createRunEvaluation(input) {
      state.runEvaluations.push(input);
      return input;
    },
    async listRunEvaluations(input) {
      return state.runEvaluations
        .filter((ev) => ev.ownerTgUserId === input.ownerTgUserId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(input.offset, input.offset + input.limit);
    },
    async createAdminAssistRun(input) {
      state.adminAssistRuns.push(input);
      return input;
    },
    async updateAdminAssistRun(input) {
      const run = state.adminAssistRuns.find(
        (item) =>
          item.id === input.id && item.ownerTgUserId === input.ownerTgUserId,
      );
      if (!run) {
        return;
      }
      run.status = input.status;
      if (input.draftJson !== undefined) {
        run.draftJson = input.draftJson;
      }
      if (input.warningsJson !== undefined) {
        run.warningsJson = input.warningsJson;
      }
      if (input.completedAt !== undefined) {
        run.completedAt = input.completedAt;
      }
    },
    async getAdminAssistRun(input) {
      return (
        state.adminAssistRuns.find(
          (run) =>
            run.id === input.id && run.ownerTgUserId === input.ownerTgUserId,
        ) ?? null
      );
    },
    async createTodo(input) {
      const todo: TodoRecord = {
        id: state.nextTodoId,
        ownerTgUserId: input.ownerTgUserId,
        title: input.title,
        status: "open",
        createdAt: input.createdAt,
        completedAt: null,
        dueAt: input.dueAt ?? null,
        remindedAt: null,
      };
      state.nextTodoId += 1;
      state.todos.push(todo);
      return todo;
    },
    async listOpenTodos(ownerTgUserId, limit) {
      return state.todos
        .filter(
          (todo) =>
            todo.ownerTgUserId === ownerTgUserId && todo.status === "open",
        )
        .slice(0, limit);
    },
    async pollDueTodos(now, advanceThreshold) {
      return state.todos
        .filter(
          (todo) =>
            todo.status === "open" &&
            todo.remindedAt === null &&
            todo.dueAt !== null &&
            todo.dueAt <= now + advanceThreshold,
        )
        .sort(
          (left, right) => (left.dueAt as number) - (right.dueAt as number),
        );
    },
    async markTodoReminded(id, remindedAt) {
      const todo = state.todos.find((t) => t.id === id);
      if (todo) {
        todo.remindedAt = remindedAt;
      }
    },
    async listTodos(ownerTgUserId, limit) {
      return state.todos
        .filter((todo) => todo.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async completeTodo(input) {
      const todo = state.todos.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.status === "open",
      );
      if (!todo) {
        return null;
      }
      todo.status = "completed";
      todo.completedAt = input.completedAt;
      return todo;
    },
    async updateTodo(input) {
      const todo = state.todos.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId && item.id === input.id,
      );
      if (!todo) {
        return null;
      }
      let completedAt = todo.completedAt;
      if (input.status === "completed" && todo.status !== "completed") {
        completedAt = input.now;
      } else if (input.status === "open" && todo.status === "completed") {
        completedAt = null;
      }

      let remindedAt = todo.remindedAt;
      if (
        input.dueAt !== todo.dueAt ||
        (input.status === "open" &&
          todo.status === "completed" &&
          input.dueAt &&
          input.dueAt > input.now)
      ) {
        remindedAt = null;
      }

      todo.title = input.title;
      todo.status = input.status;
      todo.completedAt = completedAt;
      todo.dueAt = input.dueAt;
      todo.remindedAt = remindedAt;

      return todo;
    },
    async deleteTodo(input) {
      const idx = state.todos.findIndex(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId && item.id === input.id,
      );
      if (idx === -1) {
        return false;
      }
      state.todos.splice(idx, 1);
      return true;
    },
    async createMemory(input) {
      const memory: MemoryRecord = {
        id: state.nextMemoryId,
        ownerTgUserId: input.ownerTgUserId,
        content: input.content,
        normalizedContent: input.normalizedContent,
        status: "active",
        createdAt: input.createdAt,
        deletedAt: null,
      };
      state.nextMemoryId += 1;
      state.memories.push(memory);
      return memory;
    },
    async searchMemories(input) {
      return state.memories
        .filter(
          (memory) =>
            memory.ownerTgUserId === input.ownerTgUserId &&
            memory.status === "active" &&
            memory.normalizedContent.includes(input.keyword),
        )
        .slice(0, input.limit);
    },
    async getActiveMemory(input) {
      return (
        state.memories.find(
          (memory) =>
            memory.ownerTgUserId === input.ownerTgUserId &&
            memory.id === input.id &&
            memory.status === "active",
        ) ?? null
      );
    },
    async listMemories(ownerTgUserId, limit) {
      return state.memories
        .filter((memory) => memory.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async updateMemory(input) {
      const memory = state.memories.find(
        (m) => m.id === input.id && m.ownerTgUserId === input.ownerTgUserId,
      );
      if (!memory) return null;
      memory.content = input.content;
      memory.normalizedContent = input.normalizedContent;
      return memory;
    },
    async deleteMemory(input) {
      const idx = state.memories.findIndex(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId && item.id === input.id,
      );
      if (idx === -1) {
        return false;
      }
      state.memories.splice(idx, 1);
      return true;
    },
    async recordMemoryEvent() {
      return;
    },
    async createApproval(input) {
      state.approvals.push(input);
      return input;
    },
    async findPendingApprovalByCode(input) {
      return (
        state.approvals.find(
          (approval) =>
            approval.ownerTgUserId === input.ownerTgUserId &&
            approval.code === input.code &&
            approval.status === "pending",
        ) ?? null
      );
    },
    async updateApprovalStatus(input) {
      const approval = state.approvals.find((item) => item.id === input.id);
      if (!approval) {
        return;
      }
      approval.status = input.status;
      approval.decidedAt = input.decidedAt;
    },
    async listApprovals(ownerTgUserId, limit) {
      return state.approvals
        .filter((approval) => approval.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async createPersonalModelClaim(input) {
      const claim: PersonalModelClaimRecord = { ...input };
      state.personalModelClaims.push(claim);
      return claim;
    },
    async updatePersonalModelClaim(input) {
      const claim = state.personalModelClaims.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId && item.id === input.id,
      );
      if (!claim) {
        return null;
      }
      for (const [key, value] of Object.entries(input.patch)) {
        if (value !== undefined) {
          Object.assign(claim, { [key]: value });
        }
      }
      claim.updatedAt = input.updatedAt;
      return claim;
    },
    async getPersonalModelClaim(input) {
      return (
        state.personalModelClaims.find(
          (claim) =>
            claim.ownerTgUserId === input.ownerTgUserId &&
            claim.id === input.id,
        ) ?? null
      );
    },
    async listPersonalModelClaims(input) {
      return state.personalModelClaims
        .filter(
          (claim) =>
            claim.ownerTgUserId === input.ownerTgUserId &&
            (!input.status || claim.status === input.status) &&
            (!input.scenario || claim.scenario === input.scenario),
        )
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, input.limit);
    },
    async listActivePersonalModelClaims(input) {
      return state.personalModelClaims
        .filter(
          (claim) =>
            claim.ownerTgUserId === input.ownerTgUserId &&
            claim.status === "active" &&
            claim.usagePolicy !== "do_not_use" &&
            (claim.validFrom === null || claim.validFrom <= input.now) &&
            (claim.validUntil === null || claim.validUntil > input.now),
        )
        .slice()
        .sort((left, right) => {
          const confidenceRank = { high: 0, medium: 1, low: 2 };
          const diff =
            confidenceRank[left.confidence] - confidenceRank[right.confidence];
          return diff || right.updatedAt - left.updatedAt;
        })
        .slice(0, input.limit);
    },
    async createPersonalModelEvent(input) {
      state.personalModelEvents.push(input);
      return input;
    },
    async listPersonalModelEvents(input) {
      return state.personalModelEvents
        .filter(
          (event) =>
            event.ownerTgUserId === input.ownerTgUserId &&
            event.claimId === input.claimId,
        )
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, input.limit);
    },
    async createPersonalModelSourceDocument(input) {
      const source: PersonalModelSourceDocumentRecord = { ...input };
      state.personalModelSourceDocuments.push(source);
      return source;
    },
    async updatePersonalModelSourceDocument(input) {
      const source = state.personalModelSourceDocuments.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId && item.id === input.id,
      );
      if (!source) {
        return null;
      }
      for (const [key, value] of Object.entries(input.patch)) {
        if (value !== undefined) {
          Object.assign(source, { [key]: value });
        }
      }
      return source;
    },
    async deletePersonalModelSourceDocument(input) {
      state.personalModelSourceDocuments =
        state.personalModelSourceDocuments.filter(
          (doc) =>
            !(doc.id === input.id && doc.ownerTgUserId === input.ownerTgUserId),
        );
    },
    async getPersonalModelSourceDocument(input) {
      return (
        state.personalModelSourceDocuments.find(
          (source) =>
            source.ownerTgUserId === input.ownerTgUserId &&
            source.id === input.id,
        ) ?? null
      );
    },
    async listPersonalModelSourceDocuments(input) {
      return state.personalModelSourceDocuments
        .filter(
          (source) =>
            source.ownerTgUserId === input.ownerTgUserId &&
            (!input.sourceType || source.sourceType === input.sourceType) &&
            (!input.status || source.status === input.status),
        )
        .slice()
        .sort((left, right) => right.ingestedAt - left.ingestedAt)
        .slice(0, input.limit);
    },
    async createPersonalModelSourceChunk(input) {
      const chunk: PersonalModelSourceChunkRecord = { ...input };
      state.personalModelSourceChunks.push(chunk);
      return chunk;
    },
    async getPersonalModelSourceChunk(input) {
      return (
        state.personalModelSourceChunks.find(
          (chunk) =>
            chunk.ownerTgUserId === input.ownerTgUserId &&
            chunk.id === input.id,
        ) ?? null
      );
    },
    async updatePersonalModelSourceChunk(input) {
      const chunkIndex = state.personalModelSourceChunks.findIndex(
        (c) => c.ownerTgUserId === input.ownerTgUserId && c.id === input.id,
      );
      if (chunkIndex === -1) return null;

      const chunk = state.personalModelSourceChunks[chunkIndex];
      const updatedChunk = {
        ...chunk,
        vectorId:
          input.patch.vectorId !== undefined
            ? input.patch.vectorId
            : chunk.vectorId,
        indexedAt:
          input.patch.indexedAt !== undefined
            ? input.patch.indexedAt
            : chunk.indexedAt,
        indexStatus:
          input.patch.indexStatus !== undefined
            ? input.patch.indexStatus
            : chunk.indexStatus,
      };

      state.personalModelSourceChunks[chunkIndex] = updatedChunk;
      return updatedChunk;
    },
    async listPersonalModelSourceChunks(input) {
      return state.personalModelSourceChunks
        .filter(
          (chunk) =>
            chunk.ownerTgUserId === input.ownerTgUserId &&
            chunk.documentId === input.documentId,
        )
        .slice()
        .sort((left, right) => left.chunkIndex - right.chunkIndex)
        .slice(0, input.limit);
    },
    async searchPersonalModelSourceChunks(input) {
      return state.personalModelSourceChunks
        .filter((chunk) => {
          if (chunk.ownerTgUserId !== input.ownerTgUserId) return false;
          if (!chunk.normalizedContent.includes(input.keyword.toLowerCase()))
            return false;
          const doc = state.personalModelSourceDocuments.find(
            (d) => d.id === chunk.documentId,
          );
          if (!doc) return false;
          if (doc.status !== "active") return false;
          if (doc.usagePolicy === "do_not_use") return false;
          return true;
        })
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, input.limit);
    },
    async getPersonalModelSourceChunksByIds(input) {
      const idSet = new Set(input.ids);
      return state.personalModelSourceChunks.filter((chunk) => {
        if (chunk.ownerTgUserId !== input.ownerTgUserId) return false;
        if (!idSet.has(chunk.id)) return false;
        const doc = state.personalModelSourceDocuments.find(
          (d) => d.id === chunk.documentId,
        );
        if (!doc) return false;
        if (doc.status !== "active") return false;
        if (doc.usagePolicy === "do_not_use") return false;
        return true;
      });
    },
    async createPersonalModelEvidence(input) {
      const evidence: PersonalModelEvidenceRecord = { ...input };
      state.personalModelEvidence.push(evidence);
      return evidence;
    },
    async listPersonalModelEvidence(input) {
      return state.personalModelEvidence
        .filter(
          (evidence) =>
            evidence.ownerTgUserId === input.ownerTgUserId &&
            evidence.claimId === input.claimId,
        )
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, input.limit);
    },
    async createPersonalModelMetacognitionLog(record) {
      state.personalModelMetacognitionLogs.push(record);
    },
    async listPersonalModelMetacognitionLogs(input) {
      return state.personalModelMetacognitionLogs
        .filter((l) => l.ownerTgUserId === input.ownerTgUserId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(input.offset, input.offset + input.limit);
    },
    async createPersonalModelUnderstandingGap(record) {
      state.personalModelUnderstandingGaps.push(record);
    },
    async listPersonalModelUnderstandingGaps(input) {
      return state.personalModelUnderstandingGaps
        .filter(
          (g) =>
            g.ownerTgUserId === input.ownerTgUserId &&
            (!input.status || g.status === input.status),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(input.offset, input.offset + input.limit);
    },
    async updatePersonalModelUnderstandingGapStatus(input) {
      const gap = state.personalModelUnderstandingGaps.find(
        (g) => g.id === input.gapId && g.ownerTgUserId === input.ownerTgUserId,
      );
      if (gap) {
        gap.status = input.status;
        gap.updatedAt = input.updatedAt;
      }
    },
    async createSkill(input) {
      const baseParsed = parseSkillPackageFiles(input.files);
      const parsed = state.skills.some((skill) => {
        const publishedVersion = state.skillVersions.find(
          (version) => version.id === skill.publishedVersionId,
        );
        return (
          skill.ownerTgUserId === input.ownerTgUserId &&
          skill.deletedAt === null &&
          (skill.name === baseParsed.metadata.name ||
            publishedVersion?.name === baseParsed.metadata.name)
        );
      })
        ? markSkillPackageNameConflict(baseParsed)
        : baseParsed;
      const skill: SkillRecord = {
        id: `skill-${state.skills.length + 1}`,
        ownerTgUserId: input.ownerTgUserId,
        name: parsed.metadata.name,
        description: parsed.metadata.description,
        draftFiles: parsed.files,
        draftMetadata: parsed.metadata,
        draftBody: parsed.body,
        draftFileInventory: parsed.fileInventory,
        draftValidation: parsed.validation,
        draftContentHash: parsed.contentHash,
        enabled: input.enabled,
        deletedAt: null,
        publishedVersionId: null,
        publishedVersion: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      state.skills.push(skill);
      return skill;
    },
    async updateSkillDraft(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!skill) {
        return null;
      }
      const baseParsed = parseSkillPackageFiles(input.files);
      const parsed = state.skills.some((item) => {
        const publishedVersion = state.skillVersions.find(
          (version) => version.id === item.publishedVersionId,
        );
        return (
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id !== input.id &&
          item.deletedAt === null &&
          (item.name === baseParsed.metadata.name ||
            publishedVersion?.name === baseParsed.metadata.name)
        );
      })
        ? markSkillPackageNameConflict(baseParsed)
        : baseParsed;
      skill.name = parsed.metadata.name;
      skill.description = parsed.metadata.description;
      skill.draftFiles = parsed.files;
      skill.draftMetadata = parsed.metadata;
      skill.draftBody = parsed.body;
      skill.draftFileInventory = parsed.fileInventory;
      skill.draftValidation = parsed.validation;
      skill.draftContentHash = parsed.contentHash;
      skill.enabled = input.enabled;
      skill.updatedAt = input.updatedAt;
      return skill;
    },
    async listSkills(ownerTgUserId, limit) {
      return state.skills
        .filter(
          (skill) =>
            skill.ownerTgUserId === ownerTgUserId && skill.deletedAt === null,
        )
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit);
    },
    async getSkill(input) {
      return (
        state.skills.find(
          (skill) =>
            skill.ownerTgUserId === input.ownerTgUserId &&
            skill.id === input.id,
        ) ?? null
      );
    },
    async setSkillEnabled(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!skill) {
        return null;
      }
      skill.enabled = input.enabled;
      skill.updatedAt = input.updatedAt;
      return skill;
    },
    async softDeleteSkill(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!skill) {
        return (
          state.skills.find(
            (item) =>
              item.ownerTgUserId === input.ownerTgUserId &&
              item.id === input.id &&
              item.deletedAt !== null,
          ) ?? null
        );
      }
      skill.enabled = false;
      skill.deletedAt = input.deletedAt;
      skill.updatedAt = input.deletedAt;
      return skill;
    },
    async publishSkill(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!skill) {
        return null;
      }
      if (!skill.draftValidation.ok) {
        return null;
      }
      const versionNumber = (skill.publishedVersion ?? 0) + 1;
      const version: SkillVersionRecord = {
        id: input.versionId,
        skillId: skill.id,
        ownerTgUserId: input.ownerTgUserId,
        version: versionNumber,
        name: skill.name,
        description: skill.description,
        files: skill.draftFiles,
        metadata: skill.draftMetadata,
        body: skill.draftBody,
        fileInventory: skill.draftFileInventory,
        validation: skill.draftValidation,
        contentHash: skill.draftContentHash,
        createdAt: input.createdAt,
      };
      state.skillVersions.push(version);
      skill.publishedVersionId = version.id;
      skill.publishedVersion = version.version;
      skill.updatedAt = input.createdAt;
      return version;
    },
    async getRunnableSkillByName(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.enabled &&
          item.deletedAt === null &&
          item.publishedVersionId &&
          state.skillVersions.find(
            (version) =>
              version.id === item.publishedVersionId &&
              version.name === input.name,
          ),
      );
      const version = skill
        ? state.skillVersions.find(
            (item) => item.id === skill.publishedVersionId,
          )
        : null;

      return skill && version ? { skill, version } : null;
    },
    async listRunnableSkills(ownerTgUserId) {
      return state.skills
        .filter(
          (skill) =>
            skill.ownerTgUserId === ownerTgUserId &&
            skill.enabled &&
            skill.deletedAt === null &&
            skill.publishedVersionId,
        )
        .flatMap((skill) => {
          const version = state.skillVersions.find(
            (item) => item.id === skill.publishedVersionId,
          );
          return version ? [{ skill, version }] : [];
        });
    },
    async createSkillRouteDecision(input) {
      state.skillRouteDecisions.push(input);
      return input;
    },
    async listSkillRouteDecisions(ownerTgUserId, limit) {
      return state.skillRouteDecisions
        .filter((decision) => decision.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async getSkillRouteDecisionForRun(input) {
      return (
        state.skillRouteDecisions
          .filter(
            (decision) =>
              decision.ownerTgUserId === input.ownerTgUserId &&
              decision.runId === input.runId,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async createPlannerRouteDecision(input) {
      state.plannerRouteDecisions.push(input);
      return input;
    },
    async getPlannerRouteDecisionForRun(input) {
      return (
        state.plannerRouteDecisions
          .filter(
            (decision) =>
              decision.ownerTgUserId === input.ownerTgUserId &&
              decision.runId === input.runId,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async createPendingPlannerRouteClarification(input) {
      state.pendingPlannerRouteClarifications.push(input);
      return input;
    },
    async getPendingPlannerRouteClarification(ownerTgUserId, now) {
      return (
        state.pendingPlannerRouteClarifications
          .filter(
            (clarification) =>
              clarification.ownerTgUserId === ownerTgUserId &&
              clarification.expiresAt > now,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async deletePendingPlannerRouteClarification(id) {
      const index = state.pendingPlannerRouteClarifications.findIndex(
        (clarification) => clarification.id === id,
      );
      if (index >= 0) {
        state.pendingPlannerRouteClarifications.splice(index, 1);
      }
    },
    async createSkillRun(input) {
      state.skillRuns.push(input);
      return input;
    },
    async updateSkillRun(input) {
      const skillRun = state.skillRuns.find((item) => item.id === input.id);
      if (!skillRun) {
        return;
      }
      skillRun.status = input.status;
      skillRun.outputText = input.outputText ?? null;
      skillRun.error = input.error ?? null;
      skillRun.updatedAt = input.updatedAt;
    },
    async createSkillIntent(input) {
      state.skillIntents.push(input);
      return input;
    },
    async createSkillIntentsBatch(inputs) {
      state.skillIntents.push(...inputs);
    },
    async listSkillIntents() {
      return state.skillIntents;
    },
    async deleteSkillIntent(input) {
      state.skillIntents = state.skillIntents.filter(
        (item) => item.id !== input.id,
      );
    },
    async listSkillRuns(ownerTgUserId, limit) {
      return state.skillRuns
        .filter((skillRun) => skillRun.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async getSkillRunForRun(input) {
      return (
        state.skillRuns
          .filter(
            (skillRun) =>
              skillRun.ownerTgUserId === input.ownerTgUserId &&
              skillRun.runId === input.runId,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async createLongTask(input) {
      state.longTasks.push(input);
      return input;
    },
    async updateLongTask(input) {
      const task = state.longTasks.find((item) => item.id === input.id);
      if (!task) {
        return;
      }
      task.status = input.status;
      task.title = input.title ?? task.title;
      task.plannerReason = input.plannerReason ?? task.plannerReason;
      task.currentStepId =
        input.currentStepId === undefined
          ? task.currentStepId
          : input.currentStepId;
      task.outputText =
        input.outputText === undefined ? task.outputText : input.outputText;
      task.error = input.error === undefined ? task.error : input.error;
      task.replanCount = input.replanCount ?? task.replanCount;
      task.telegramChatId =
        input.telegramChatId === undefined
          ? task.telegramChatId
          : input.telegramChatId;
      task.telegramMessageId =
        input.telegramMessageId === undefined
          ? task.telegramMessageId
          : input.telegramMessageId;
      task.updatedAt = input.updatedAt;
    },
    async getLongTask(input) {
      return (
        state.longTasks.find(
          (task) =>
            task.ownerTgUserId === input.ownerTgUserId && task.id === input.id,
        ) ?? null
      );
    },
    async getLatestActiveLongTask(ownerTgUserId) {
      return (
        state.longTasks
          .filter(
            (task) =>
              task.ownerTgUserId === ownerTgUserId &&
              ["planning", "running", "waiting_for_user", "paused"].includes(
                task.status,
              ),
          )
          .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
      );
    },
    async deleteLongTask(input) {
      state.longTasks = state.longTasks.filter(
        (t) => !(t.ownerTgUserId === input.ownerTgUserId && t.id === input.id),
      );
      state.longTaskSteps = state.longTaskSteps.filter(
        (s) => s.longTaskId !== input.id,
      );
      state.longTaskEvents = state.longTaskEvents.filter(
        (e) => e.longTaskId !== input.id,
      );
    },
    async getLongTaskForRun(input) {
      return (
        state.longTasks
          .filter(
            (task) =>
              task.ownerTgUserId === input.ownerTgUserId &&
              task.runId === input.runId,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async listLongTasks(ownerTgUserId, limit) {
      return state.longTasks
        .filter((task) => task.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit);
    },
    async listResumableLongTasks(now, limit) {
      return state.longTasks
        .filter(
          (task) => task.status === "running" && task.updatedAt <= now - 30000,
        )
        .slice()
        .sort((left, right) => left.updatedAt - right.updatedAt)
        .slice(0, limit);
    },
    async createLongTaskStep(input) {
      state.longTaskSteps.push(input);
      return input;
    },
    async updateLongTaskStep(input) {
      const step = state.longTaskSteps.find((item) => item.id === input.id);
      if (!step) {
        return;
      }
      step.status = input.status;
      step.outputJson =
        input.outputJson === undefined ? step.outputJson : input.outputJson;
      step.error = input.error === undefined ? step.error : input.error;
      step.startedAt =
        input.startedAt === undefined ? step.startedAt : input.startedAt;
      step.completedAt =
        input.completedAt === undefined ? step.completedAt : input.completedAt;
    },
    async claimNextLongTaskStep(input) {
      const step = state.longTaskSteps
        .filter(
          (item) =>
            item.longTaskId === input.longTaskId && item.status === "pending",
        )
        .sort((left, right) => left.position - right.position)[0];
      if (!step) {
        return null;
      }
      step.status = "running";
      step.startedAt = input.startedAt;
      return step;
    },
    async listLongTaskSteps(longTaskId) {
      return state.longTaskSteps
        .filter((step) => step.longTaskId === longTaskId)
        .slice()
        .sort((left, right) => left.position - right.position);
    },
    async createLongTaskEvent(input) {
      state.longTaskEvents.push(input);
      return input;
    },
    async listLongTaskEvents(longTaskId) {
      return state.longTaskEvents
        .filter((event) => event.longTaskId === longTaskId)
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt);
    },
    async createSchedule(input) {
      state.schedules.push(input);
      return input;
    },
    async updateSchedule(input) {
      const schedule = state.schedules.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!schedule) {
        return null;
      }
      Object.assign(schedule, {
        name: input.name,
        commandText: input.commandText,
        enabled: input.enabled,
        timezone: input.timezone,
        cadence: input.cadence,
        timeOfDay: input.timeOfDay,
        daysOfWeek: input.daysOfWeek,
        nextRunAt: input.nextRunAt,
        updatedAt: input.updatedAt,
      });
      return schedule;
    },
    async setScheduleEnabled(input) {
      const schedule = state.schedules.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!schedule) {
        return null;
      }
      schedule.enabled = input.enabled;
      schedule.nextRunAt = input.nextRunAt;
      schedule.updatedAt = input.updatedAt;
      return schedule;
    },
    async softDeleteSchedule(input) {
      const schedule = state.schedules.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null,
      );
      if (!schedule) {
        return (
          state.schedules.find(
            (item) =>
              item.ownerTgUserId === input.ownerTgUserId &&
              item.id === input.id &&
              item.deletedAt !== null,
          ) ?? null
        );
      }
      schedule.enabled = false;
      schedule.deletedAt = input.deletedAt;
      schedule.updatedAt = input.deletedAt;
      return schedule;
    },
    async getSchedule(input) {
      return (
        state.schedules.find(
          (item) =>
            item.ownerTgUserId === input.ownerTgUserId &&
            item.id === input.id &&
            item.deletedAt === null,
        ) ?? null
      );
    },
    async listSchedules(ownerTgUserId, limit) {
      return state.schedules
        .filter(
          (schedule) =>
            schedule.ownerTgUserId === ownerTgUserId &&
            schedule.deletedAt === null,
        )
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit);
    },
    async listDueSchedules(now, limit) {
      return state.schedules
        .filter(
          (schedule) =>
            schedule.enabled &&
            schedule.deletedAt === null &&
            schedule.nextRunAt <= now,
        )
        .slice()
        .sort((left, right) => left.nextRunAt - right.nextRunAt)
        .slice(0, limit);
    },
    async createScheduleExecution(input) {
      const existing = state.scheduleExecutions.find(
        (item) =>
          item.scheduleId === input.scheduleId &&
          item.scheduledFor === input.scheduledFor,
      );
      if (existing) {
        return null;
      }
      state.scheduleExecutions.push(input);
      return input;
    },
    async updateScheduleExecution(input) {
      const execution = state.scheduleExecutions.find(
        (item) => item.id === input.id,
      );
      if (!execution) {
        return;
      }
      execution.runId = input.runId ?? execution.runId;
      execution.status = input.status;
      execution.outputText = input.outputText ?? null;
      execution.error = input.error ?? null;
      execution.updatedAt = input.updatedAt;
    },
    async markScheduleExecuted(input) {
      const schedule = state.schedules.find((item) => item.id === input.id);
      if (!schedule) {
        return;
      }
      schedule.lastRunAt = input.lastRunAt;
      schedule.nextRunAt = input.nextRunAt;
      schedule.updatedAt = input.updatedAt;
    },
    async listScheduleExecutions(input) {
      return state.scheduleExecutions
        .filter(
          (execution) =>
            execution.ownerTgUserId === input.ownerTgUserId &&
            (!input.scheduleId || execution.scheduleId === input.scheduleId),
        )
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, input.limit);
    },
    async getScheduleExecutionForRun(input) {
      return (
        state.scheduleExecutions
          .filter(
            (execution) =>
              execution.ownerTgUserId === input.ownerTgUserId &&
              execution.runId === input.runId,
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async getUserProfile(id) {
      return state.userProfiles.find((p) => p.id === id) ?? null;
    },
    async upsertUserProfile(input) {
      const existing = state.userProfiles.find((p) => p.id === input.id);
      if (existing) {
        Object.assign(existing, input);
      } else {
        state.userProfiles.push(input);
      }
      return input;
    },
  };
}

export function createFakeTelegramClient(
  options: { fail?: boolean } = {},
): TelegramClient & {
  messages: Array<{ messageId?: number; chatId: number; text: string }>;
} {
  const messages: Array<{ messageId?: number; chatId: number; text: string }> =
    [];
  let nextMessageId = 1;

  return {
    messages,
    async sendMessage(input) {
      if (options.fail) {
        throw new Error("send failed");
      }
      const messageId = nextMessageId++;
      messages.push({ ...input, messageId });
      return { messageId };
    },
    async editMessageText(input) {
      const idx = messages.findIndex((m) => m.messageId === input.messageId);
      if (idx !== -1) {
        messages[idx].text = input.text;
      } else {
        messages.push(input as any);
      }
    },
    async deleteMessage(input) {
      const idx = messages.findIndex((m) => m.messageId === input.messageId);
      if (idx !== -1) {
        messages.splice(idx, 1);
      }
    },
    async sendChatAction() {},
    async answerCallbackQuery() {},
  };
}

export function createFakeLlmClient(
  options: {
    fail?: boolean;
    alwaysTool?: boolean;
    plannerContent?: string;
    executionPlanContent?: string;
    semanticConfidence?: number;
  } = {},
): LlmClient & { calls: LlmMessage[][] } {
  const calls: LlmMessage[][] = [];

  return {
    calls,
    async createChatCompletion(input): Promise<LlmChatCompletionOutput> {
      if (options.fail) {
        throw new Error("llm failed");
      }
      calls.push(input.messages);
      const latest = input.messages.at(-1);
      const systemText = input.messages[0]?.content ?? "";
      if (
        systemText.includes("skill 路由器") ||
        systemText.includes("统一路由调度器")
      ) {
        const payload = JSON.parse(latest?.content ?? "{}") as {
          inputText?: string;
          skills?: Array<{ name: string; description: string }>;
        };
        const text = payload.inputText ?? "";
        const matched = (payload.skills ?? []).find((skill) =>
          `${text} ${skill.name} ${skill.description}`.includes("规划"),
        );
        const confidence = matched ? (options.semanticConfidence ?? 0.88) : 0.2;
        const skillResult = {
          matchedSkillName: matched?.name ?? null,
          confidence,
          reason: matched ? "fake semantic match" : "fake no match",
          candidates: matched
            ? [
                {
                  name: matched.name,
                  confidence,
                  reason: "fake semantic match",
                },
              ]
            : [],
        };
        return {
          content: JSON.stringify(
            systemText.includes("统一路由调度器")
              ? { semanticSkill: skillResult }
              : skillResult,
          ),
          toolCalls: [],
        };
      }
      if (systemText.includes("任务复杂度分类器")) {
        const text = latest?.content ?? "";
        const isLongTask =
          /调研|研究|比较|对比|报告|规划|计划|方案|分析|多步|整理|搜索.*并/u.test(
            text,
          ) || text.length >= 120;

        return {
          content: JSON.stringify({
            semanticSkill: {
              matchedSkillName: null,
              confidence: 0.2,
              reason: "fake no match",
              candidates: [],
            },
            taskComplexity: {
              mode: isLongTask ? "long_task" : "simple",
              score: isLongTask ? 0.8 : 0.2,
              reason: isLongTask
                ? "fake complex request"
                : "fake simple request",
            },
            plannerRoute: {
              policyVersion: "planner-route-v1",
              mode: "none",
              confidence: 1,
              reason: "fake planner route",
              candidateTools: [],
              toolActionRisk: "none",
              freshnessRisk: "low",
              privacyRisk: "low",
              confirmationRequired: false,
              searchPolicy: {
                allowedTopics: [],
                suggestedQueries: [],
                forbiddenTerms: [],
                redactionRequired: false,
                maxQueries: 0,
              },
              fetchPolicy: {
                explicitAllowedUrls: [],
                allowSearchResultUrls: false,
                allowedDomains: [],
                maxUrls: 0,
              },
              signals: [],
              classifierUsed: true,
              question: null,
            },
          }),
          toolCalls: [],
        };
      }
      if (systemText.includes("执行规划者")) {
        if (options.executionPlanContent !== undefined) {
          return {
            content: options.executionPlanContent,
            toolCalls: [],
          };
        }
        const text = latest?.content ?? "";
        if (/搜索网页|联网|查一下|查找|搜索/u.test(text)) {
          return {
            content: JSON.stringify([
              {
                step: 1,
                action: "tool",
                tool: "web_search",
                reason: "需要搜索公开网页",
              },
              {
                step: 2,
                action: "tool",
                tool: "submit_answer",
                reason: "提交搜索结果",
              },
            ]),
            toolCalls: [],
          };
        }
        if (/读取|抓取网页/u.test(text)) {
          return {
            content: JSON.stringify([
              {
                step: 1,
                action: "tool",
                tool: "fetch_url",
                reason: "需要读取指定网页",
              },
              {
                step: 2,
                action: "tool",
                tool: "submit_answer",
                reason: "提交网页内容",
              },
            ]),
            toolCalls: [],
          };
        }
        if (text.includes("新增待办")) {
          return {
            content: JSON.stringify([
              {
                step: 1,
                action: "tool",
                tool: "create_todo",
                reason: "需要写入待办",
              },
            ]),
            toolCalls: [],
          };
        }
        return {
          content: "[]",
          toolCalls: [],
        };
      }
      if (systemText.includes("长任务规划器")) {
        if (options.plannerContent !== undefined) {
          return {
            content: options.plannerContent,
            toolCalls: [],
          };
        }
        return {
          content: JSON.stringify({
            title: "测试长任务",
            steps: [
              {
                title: "收集信息",
                description: "搜索网页",
                toolPolicy: "external_send",
                successCriteria: "拿到搜索结果",
              },
              {
                title: "总结结果",
                description: "整理结论",
                toolPolicy: "none",
                successCriteria: "输出总结",
              },
            ],
            userConfirmationRequired: false,
            confirmationQuestion: null,
          }),
          toolCalls: [],
        };
      }
      if (latest?.role === "tool") {
        if (latest.content?.includes('"blocked":true')) {
          return {
            content: "这个 skill 不允许使用工具 delete_memory_request。",
            toolCalls: [],
          };
        }

        const toolResultContent = latest.content ?? "";
        if (toolResultContent.includes("疑似指令注入")) {
          return {
            content: toolResultContent,
            toolCalls: [],
          };
        }

        const isSearchOrFetch =
          toolResultContent.includes("https://") ||
          toolResultContent.includes("Cloudflare Workers") ||
          toolResultContent.includes("Example page content");

        if (isSearchOrFetch) {
          return {
            content: "",
            toolCalls: [
              {
                id: "call-submit-answer",
                type: "function",
                function: {
                  name: "submit_answer",
                  arguments: JSON.stringify({
                    text: "根据搜索结果，Cloudflare Workers 是一个边缘计算平台。",
                    citations: [
                      {
                        url: toolResultContent.includes("https://example.com/")
                          ? "https://example.com/"
                          : "https://developers.cloudflare.com/workers/",
                        title: "Cloudflare Workers",
                        snippet_used: "Workers docs",
                      },
                    ],
                  }),
                },
              },
            ],
          };
        }

        return {
          content: `工具结果已处理：${latest.content ?? ""}`,
          toolCalls: options.alwaysTool
            ? [
                {
                  id: "call-loop",
                  type: "function",
                  function: {
                    name: "list_todos",
                    arguments: "{}",
                  },
                },
              ]
            : [],
        };
      }

      const text = latest?.content ?? "";
      if (text.includes("新增待办")) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call-create-todo",
              type: "function",
              function: {
                name: "create_todo",
                arguments: JSON.stringify({
                  title: text.split(/[:：]/u).at(-1)?.trim() ?? text,
                }),
              },
            },
          ],
        };
      }
      if (text.includes("删除记忆")) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call-delete-memory",
              type: "function",
              function: {
                name: "delete_memory_request",
                arguments: JSON.stringify({ id: 1 }),
              },
            },
          ],
        };
      }
      if (/搜索网页|联网|查一下|查找|搜索/u.test(text)) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call-web-search",
              type: "function",
              function: {
                name: "web_search",
                arguments: JSON.stringify({ query: "Cloudflare Workers" }),
              },
            },
          ],
        };
      }
      if (/读取|抓取网页/u.test(text)) {
        const url =
          text.match(/\bhttps?:\/\/[^\s]+/u)?.[0] ?? "https://example.com";
        return {
          content: "",
          toolCalls: [
            {
              id: "call-fetch-url",
              type: "function",
              function: {
                name: "fetch_url",
                arguments: JSON.stringify({ url }),
              },
            },
          ],
        };
      }

      return {
        content: `LLM 回复：${text}`,
        toolCalls: [],
      };
    },
  };
}

export function createFakeSearchClient(
  options: { fail?: boolean } = {},
): SearchClient & { queries: string[] } {
  const queries: string[] = [];

  return {
    queries,
    async search(input) {
      if (options.fail) {
        throw new Error("search failed");
      }
      queries.push(input.query);
      return input.query
        ? [
            {
              title: "Cloudflare Workers",
              url: "https://developers.cloudflare.com/workers/",
              description: "Workers docs",
              source: "brave",
              rank: 1,
            },
          ]
        : [];
    },
  };
}

export function createFakeUrlFetcher(
  options: { fail?: boolean; tooLarge?: boolean; text?: string } = {},
): UrlFetcher & { urls: string[] } {
  const urls: string[] = [];

  return {
    urls,
    async fetchUrl(input) {
      if (options.fail) {
        throw new Error("fetch failed");
      }
      if (options.tooLarge) {
        return {
          url: input.url,
          title: "Example",
          text: (options.text ?? "Example page content").slice(0, 1),
          bytesRead: 1,
          isTruncated: true,
        };
      }
      urls.push(input.url);
      return {
        url: input.url,
        title: "Example",
        text: options.text ?? "Example page content",
        bytesRead: 20,
        isTruncated: false,
      };
    },
  };
}

export function createFakeD1Database(tableNames: string[]): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async all() {
          return {
            results: tableNames.map((name) => ({ name })),
            success: true,
            meta: {},
          };
        },
      };
    },
  } as unknown as D1Database;
}

export function createTestApp(
  options: {
    telegramFails?: boolean;
    llmFails?: boolean;
    llmAlwaysTool?: boolean;
    plannerContent?: string;
    searchFails?: boolean;
    fetchFails?: boolean;
    fetchText?: string;
    executionPlanContent?: string;
    semanticConfidence?: number;
  } = {},
) {
  const repositories = createFakeRepositories();
  const telegramClient = createFakeTelegramClient({
    fail: options.telegramFails,
  });
  const llmClient = createFakeLlmClient({
    fail: options.llmFails,
    alwaysTool: options.llmAlwaysTool,
    plannerContent: options.plannerContent,
    executionPlanContent: options.executionPlanContent,
    semanticConfidence: options.semanticConfidence,
  });
  const searchClient = createFakeSearchClient({ fail: options.searchFails });
  const urlFetcher = createFakeUrlFetcher({
    fail: options.fetchFails,
    text: options.fetchText,
  });
  let id = 0;
  const app = createWorkerApp({
    repositories,
    telegramClient,
    llmClient,
    searchClient,
    urlFetcher,
    now: () => 1000 + id,
    generateId: () => {
      id += 1;
      return `id-${id}`;
    },
    generateApprovalCode: () => "123456",
  });

  return {
    app,
    repositories,
    telegramClient,
    llmClient,
    searchClient,
    urlFetcher,
  };
}

export async function postWebhook(
  app: ReturnType<typeof createWorkerApp>,
  body: unknown,
) {
  const res = await app.request(
    "/telegram/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "webhook-secret",
      },
      body: JSON.stringify(body),
    },
    env,
  );
  if (!res.ok) {
    throw new Error(`postWebhook failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function ownerCookie() {
  const session = await signSession({
    user: {
      id: 1229,
      username: "shixiong",
      firstName: "Shixiong",
    },
    secret: env.ADMIN_SESSION_SECRET,
  });

  return buildSessionCookie({ value: session });
}

export function ownerCallback(
  data: string,
  messageId: number = 1,
  fromId: number = 1229,
) {
  return {
    update_id: 1,
    callback_query: {
      id: "cb_1",
      from: { id: fromId, is_bot: false, first_name: "Test" },
      message: {
        message_id: messageId,
        chat: { id: fromId, type: "private" },
        date: 1000,
      },
      data,
    },
  };
}
