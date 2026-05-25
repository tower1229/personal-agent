import { type BuiltInToolName } from "@personal-agent/shared";
import { buildSessionCookie, signSession } from "../auth.js";
import { createWorkerApp } from "../app.js";
import {
  type SearchClient,
  type UrlFetcher
} from "../externalTools.js";
import {
  type LlmChatCompletionOutput,
  type LlmClient,
  type LlmMessage
} from "../llm.js";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type SkillVersionRecord,
  type TodoRecord,
  type ToolCallRecord,
  type WorkflowRunRecord,
  type WorkflowStepRecord
} from "../repositories.js";
import { type TelegramClient } from "../telegram.js";
import { type WorkerEnv } from "../types.js";

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
  FETCH_URL_MAX_BYTES: "200000"
};

export function ownerUpdate(text: string, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: {
        id: 1229,
        first_name: "Shixiong"
      },
      chat: {
        id: 1229
      },
      text
    }
  };
}

export function chatSkillManifest(input: {
  id: string;
  triggerPhrases?: string[];
  allowedTools?: BuiltInToolName[];
  instructions?: string;
}) {
  return {
    id: input.id,
    name: input.id,
    description: `${input.id} description`,
    kind: "chat" as const,
    enabled: true,
    triggerPhrases: input.triggerPhrases ?? [],
    intentExamples: [],
    instructions: input.instructions ?? "用简洁中文回应。",
    allowedTools: input.allowedTools ?? [],
    riskLevel: "read" as const,
    autoRunThreshold: 0.75,
    confirmThreshold: 0.45,
    workflowTemplate: []
  };
}

export function workflowSkillManifest(
  id: string,
  workflowTemplate = [
    {
      id: "reply",
      type: "tool" as const,
      input: {
        text: "列出我的待办"
      }
    }
  ]
) {
  return {
    ...chatSkillManifest({ id }),
    kind: "workflow" as const,
    workflowTemplate
  };
}

export function createFakeRepositories(): AgentRepositories & {
  runs: RunRecord[];
  toolCalls: ToolCallRecord[];
  todos: TodoRecord[];
  memories: MemoryRecord[];
  approvals: ApprovalRequestRecord[];
  skills: SkillRecord[];
  skillVersions: SkillVersionRecord[];
  skillRouteDecisions: SkillRouteDecisionRecord[];
  skillRuns: SkillRunRecord[];
  workflowRuns: WorkflowRunRecord[];
  workflowSteps: WorkflowStepRecord[];
  schedules: ScheduleRecord[];
  scheduleExecutions: ScheduleExecutionRecord[];
} {
  const state = {
    runs: [] as RunRecord[],
    toolCalls: [] as ToolCallRecord[],
    todos: [] as TodoRecord[],
    memories: [] as MemoryRecord[],
    approvals: [] as ApprovalRequestRecord[],
    skills: [] as SkillRecord[],
    skillVersions: [] as SkillVersionRecord[],
    skillRouteDecisions: [] as SkillRouteDecisionRecord[],
    skillRuns: [] as SkillRunRecord[],
    workflowRuns: [] as WorkflowRunRecord[],
    workflowSteps: [] as WorkflowStepRecord[],
    schedules: [] as ScheduleRecord[],
    scheduleExecutions: [] as ScheduleExecutionRecord[],
    nextTodoId: 1,
    nextMemoryId: 1
  };

  return {
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
    get skillRuns() {
      return state.skillRuns;
    },
    get workflowRuns() {
      return state.workflowRuns;
    },
    get workflowSteps() {
      return state.workflowSteps;
    },
    get schedules() {
      return state.schedules;
    },
    get scheduleExecutions() {
      return state.scheduleExecutions;
    },
    async createRun(input) {
      const run: RunRecord = {
        ...input,
        status: "running",
        responseText: null,
        error: null
      };
      state.runs.push(run);
      return run;
    },
    async updateRun(id, patch) {
      const run = state.runs.find((item) => item.id === id);
      if (!run) {
        return;
      }
      run.status = patch.status;
      run.responseText = patch.responseText ?? null;
      run.error = patch.error ?? null;
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
          (run) => run.ownerTgUserId === input.ownerTgUserId && run.id === input.id
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
            toolCall.runId === input.runId
        )
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt);
    },
    async createTodo(input) {
      const todo: TodoRecord = {
        id: state.nextTodoId,
        ownerTgUserId: input.ownerTgUserId,
        title: input.title,
        status: "open",
        createdAt: input.createdAt,
        completedAt: null
      };
      state.nextTodoId += 1;
      state.todos.push(todo);
      return todo;
    },
    async listOpenTodos(ownerTgUserId, limit) {
      return state.todos
        .filter(
          (todo) => todo.ownerTgUserId === ownerTgUserId && todo.status === "open"
        )
        .slice(0, limit);
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
          item.status === "open"
      );
      if (!todo) {
        return null;
      }
      todo.status = "completed";
      todo.completedAt = input.completedAt;
      return todo;
    },
    async createMemory(input) {
      const memory: MemoryRecord = {
        id: state.nextMemoryId,
        ownerTgUserId: input.ownerTgUserId,
        content: input.content,
        normalizedContent: input.normalizedContent,
        status: "active",
        createdAt: input.createdAt,
        deletedAt: null
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
            memory.normalizedContent.includes(input.keyword)
        )
        .slice(0, input.limit);
    },
    async getActiveMemory(input) {
      return (
        state.memories.find(
          (memory) =>
            memory.ownerTgUserId === input.ownerTgUserId &&
            memory.id === input.id &&
            memory.status === "active"
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
    async markMemoryDeleted(input) {
      const memory = state.memories.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.status === "active"
      );
      if (!memory) {
        return null;
      }
      memory.status = "deleted";
      memory.deletedAt = input.deletedAt;
      return memory;
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
            approval.status === "pending"
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
    async createSkill(input) {
      const skill: SkillRecord = {
        id: input.manifest.id,
        ownerTgUserId: input.ownerTgUserId,
        draftManifest: input.manifest,
        enabled: input.manifest.enabled,
        deletedAt: null,
        publishedVersionId: null,
        publishedVersion: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
      };
      state.skills.push(skill);
      return skill;
    },
    async updateSkillDraft(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null
      );
      if (!skill) {
        return null;
      }
      skill.draftManifest = input.manifest;
      skill.enabled = input.manifest.enabled;
      skill.updatedAt = input.updatedAt;
      return skill;
    },
    async listSkills(ownerTgUserId, limit) {
      return state.skills
        .filter(
          (skill) =>
            skill.ownerTgUserId === ownerTgUserId &&
            skill.deletedAt === null
        )
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit);
    },
    async getSkill(input) {
      return (
        state.skills.find(
          (skill) =>
            skill.ownerTgUserId === input.ownerTgUserId && skill.id === input.id
        ) ?? null
      );
    },
    async setSkillEnabled(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null
      );
      if (!skill) {
        return null;
      }
      skill.enabled = input.enabled;
      skill.draftManifest = {
        ...skill.draftManifest,
        enabled: input.enabled
      };
      skill.updatedAt = input.updatedAt;
      return skill;
    },
    async softDeleteSkill(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null
      );
      if (!skill) {
        return (
          state.skills.find(
            (item) =>
              item.ownerTgUserId === input.ownerTgUserId &&
              item.id === input.id &&
              item.deletedAt !== null
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
          item.deletedAt === null
      );
      if (!skill) {
        return null;
      }
      const versionNumber = (skill.publishedVersion ?? 0) + 1;
      const version: SkillVersionRecord = {
        id: input.versionId,
        skillId: skill.id,
        ownerTgUserId: input.ownerTgUserId,
        version: versionNumber,
        manifest: skill.draftManifest,
        createdAt: input.createdAt
      };
      state.skillVersions.push(version);
      skill.publishedVersionId = version.id;
      skill.publishedVersion = version.version;
      skill.updatedAt = input.createdAt;
      return version;
    },
    async getRunnableSkillById(input) {
      const skill = state.skills.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.enabled &&
          item.deletedAt === null &&
          item.publishedVersionId
      );
      const version = skill
        ? state.skillVersions.find((item) => item.id === skill.publishedVersionId)
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
            skill.publishedVersionId
        )
        .flatMap((skill) => {
          const version = state.skillVersions.find(
            (item) => item.id === skill.publishedVersionId
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
              decision.runId === input.runId
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
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
              skillRun.runId === input.runId
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async createWorkflowRun(input) {
      state.workflowRuns.push(input);
      return input;
    },
    async updateWorkflowRun(input) {
      const workflowRun = state.workflowRuns.find((item) => item.id === input.id);
      if (!workflowRun) {
        return;
      }
      workflowRun.status = input.status;
      workflowRun.outputText = input.outputText ?? null;
      workflowRun.error = input.error ?? null;
      workflowRun.cloudflareWorkflowInstanceId =
        input.cloudflareWorkflowInstanceId ??
        workflowRun.cloudflareWorkflowInstanceId;
      workflowRun.updatedAt = input.updatedAt;
    },
    async getWorkflowRun(input) {
      return (
        state.workflowRuns.find(
          (item) =>
            item.ownerTgUserId === input.ownerTgUserId && item.id === input.id
        ) ?? null
      );
    },
    async listWorkflowRuns(ownerTgUserId, limit) {
      return state.workflowRuns
        .filter((workflowRun) => workflowRun.ownerTgUserId === ownerTgUserId)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit);
    },
    async getWorkflowRunForRun(input) {
      return (
        state.workflowRuns
          .filter(
            (workflowRun) =>
              workflowRun.ownerTgUserId === input.ownerTgUserId &&
              workflowRun.runId === input.runId
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    },
    async createWorkflowStep(input) {
      state.workflowSteps.push(input);
      return input;
    },
    async updateWorkflowStep(input) {
      const workflowStep = state.workflowSteps.find((item) => item.id === input.id);
      if (!workflowStep) {
        return;
      }
      workflowStep.status = input.status;
      workflowStep.outputJson = input.outputJson ?? null;
      workflowStep.error = input.error ?? null;
      workflowStep.completedAt = input.completedAt ?? null;
    },
    async listWorkflowSteps(workflowRunId) {
      return state.workflowSteps.filter(
        (workflowStep) => workflowStep.workflowRunId === workflowRunId
      );
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
          item.deletedAt === null
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
        updatedAt: input.updatedAt
      });
      return schedule;
    },
    async setScheduleEnabled(input) {
      const schedule = state.schedules.find(
        (item) =>
          item.ownerTgUserId === input.ownerTgUserId &&
          item.id === input.id &&
          item.deletedAt === null
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
          item.deletedAt === null
      );
      if (!schedule) {
        return (
          state.schedules.find(
            (item) =>
              item.ownerTgUserId === input.ownerTgUserId &&
              item.id === input.id &&
              item.deletedAt !== null
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
            item.deletedAt === null
        ) ?? null
      );
    },
    async listSchedules(ownerTgUserId, limit) {
      return state.schedules
        .filter(
          (schedule) =>
            schedule.ownerTgUserId === ownerTgUserId &&
            schedule.deletedAt === null
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
            schedule.nextRunAt <= now
        )
        .slice()
        .sort((left, right) => left.nextRunAt - right.nextRunAt)
        .slice(0, limit);
    },
    async createScheduleExecution(input) {
      const existing = state.scheduleExecutions.find(
        (item) =>
          item.scheduleId === input.scheduleId &&
          item.scheduledFor === input.scheduledFor
      );
      if (existing) {
        return null;
      }
      state.scheduleExecutions.push(input);
      return input;
    },
    async updateScheduleExecution(input) {
      const execution = state.scheduleExecutions.find(
        (item) => item.id === input.id
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
            (!input.scheduleId || execution.scheduleId === input.scheduleId)
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
              execution.runId === input.runId
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
      );
    }
  };
}

export function createFakeTelegramClient(options: { fail?: boolean } = {}):
  TelegramClient & { messages: Array<{ chatId: number; text: string }> } {
  const messages: Array<{ chatId: number; text: string }> = [];

  return {
    messages,
    async sendMessage(input) {
      if (options.fail) {
        throw new Error("send failed");
      }
      messages.push(input);
    }
  };
}

export function createFakeLlmClient(options: { fail?: boolean; alwaysTool?: boolean } = {}):
  LlmClient & { calls: LlmMessage[][] } {
  const calls: LlmMessage[][] = [];

  return {
    calls,
    async createChatCompletion(input): Promise<LlmChatCompletionOutput> {
      if (options.fail) {
        throw new Error("llm failed");
      }
      calls.push(input.messages);
      const latest = input.messages.at(-1);
      if (latest?.role === "tool") {
        if (latest.content?.includes('"blocked":true')) {
          return {
            content: "这个 skill 不允许使用工具 delete_memory_request。",
            toolCalls: []
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
                    arguments: "{}"
                  }
                }
              ]
            : []
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
                  title: text.split(/[:：]/u).at(-1)?.trim() ?? text
                })
              }
            }
          ]
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
                arguments: JSON.stringify({ id: 1 })
              }
            }
          ]
        };
      }
      if (text.includes("搜索网页")) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call-web-search",
              type: "function",
              function: {
                name: "web_search",
                arguments: JSON.stringify({ query: "Cloudflare Workers" })
              }
            }
          ]
        };
      }
      if (text.includes("读取网页")) {
        return {
          content: "",
          toolCalls: [
            {
              id: "call-fetch-url",
              type: "function",
              function: {
                name: "fetch_url",
                arguments: JSON.stringify({ url: "https://example.com" })
              }
            }
          ]
        };
      }

      return {
        content: `LLM 回复：${text}`,
        toolCalls: []
      };
    }
  };
}

export function createFakeSearchClient(options: { fail?: boolean } = {}):
  SearchClient & { queries: string[] } {
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
              rank: 1
            }
          ]
        : [];
    }
  };
}

export function createFakeUrlFetcher(options: { fail?: boolean; tooLarge?: boolean } = {}):
  UrlFetcher & { urls: string[] } {
  const urls: string[] = [];

  return {
    urls,
    async fetchUrl(input) {
      if (options.fail) {
        throw new Error("fetch failed");
      }
      if (options.tooLarge) {
        throw new Error("fetch_url exceeded 1 bytes");
      }
      urls.push(input.url);
      return {
        url: input.url,
        title: "Example",
        text: "Example page content",
        bytesRead: 20
      };
    }
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
            meta: {}
          };
        }
      };
    }
  } as unknown as D1Database;
}

export function createTestApp(
  options: {
    telegramFails?: boolean;
    workflowStarterFails?: boolean;
    llmFails?: boolean;
    llmAlwaysTool?: boolean;
    searchFails?: boolean;
    fetchFails?: boolean;
  } = {}
) {
  const repositories = createFakeRepositories();
  const telegramClient = createFakeTelegramClient({
    fail: options.telegramFails
  });
  const llmClient = createFakeLlmClient({
    fail: options.llmFails,
    alwaysTool: options.llmAlwaysTool
  });
  const searchClient = createFakeSearchClient({ fail: options.searchFails });
  const urlFetcher = createFakeUrlFetcher({ fail: options.fetchFails });
  const workflowCreates: Array<{ id: string; params: unknown }> = [];
  let id = 0;
  const app = createWorkerApp({
    repositories,
    telegramClient,
    llmClient,
    searchClient,
    urlFetcher,
    workflowStarter: {
      async create(input) {
        if (options.workflowStarterFails) {
          throw new Error("workflow start failed");
        }
        workflowCreates.push(input);
        return {};
      }
    },
    now: () => 1000 + id,
    generateId: () => {
      id += 1;
      return `id-${id}`;
    },
    generateApprovalCode: () => "123456"
  });

  return {
    app,
    repositories,
    telegramClient,
    workflowCreates,
    llmClient,
    searchClient,
    urlFetcher
  };
}

export async function postWebhook(app: ReturnType<typeof createWorkerApp>, body: unknown) {
  return app.request(
    "/telegram/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
      },
      body: JSON.stringify(body)
    },
    env
  );
}

export async function ownerCookie() {
  const session = await signSession({
    user: {
      id: 1229,
      username: "shixiong",
      firstName: "Shixiong"
    },
    secret: env.ADMIN_SESSION_SECRET
  });

  return buildSessionCookie({ value: session });
}
