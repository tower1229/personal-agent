import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp, runScheduled } from "./app.js";
import { executeAgentTool } from "./agent.js";
import {
  createUrlFetcher,
  type SearchClient,
  type UrlFetcher
} from "./externalTools.js";
import {
  type LlmChatCompletionOutput,
  type LlmClient,
  type LlmMessage
} from "./llm.js";
import { executeWorkflowSkillRun } from "./workflowExecutor.js";
import { type BuiltInToolName } from "@personal-agent/shared";
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
} from "./repositories.js";
import { type TelegramClient } from "./telegram.js";
import { type WorkerEnv } from "./types.js";

const env: WorkerEnv = {
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

function ownerUpdate(text: string, updateId = 1) {
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

function chatSkillManifest(input: {
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

function workflowSkillManifest(
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

function createFakeRepositories(): AgentRepositories & {
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

function createFakeTelegramClient(options: { fail?: boolean } = {}):
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

function createFakeLlmClient(options: { fail?: boolean; alwaysTool?: boolean } = {}):
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

function createFakeSearchClient(options: { fail?: boolean } = {}):
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

function createFakeUrlFetcher(options: { fail?: boolean; tooLarge?: boolean } = {}):
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

function createFakeD1Database(tableNames: string[]): D1Database {
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

function createTestApp(
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

async function postWebhook(app: ReturnType<typeof createWorkerApp>, body: unknown) {
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

async function ownerCookie() {
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

describe("worker app", () => {
  it("serves health and unauthenticated session state", async () => {
    const { app } = createTestApp();
    const health = await app.request("/api/admin/health", {}, env);
    const me = await app.request("/api/admin/me", {}, env);

    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: "personal-agent-worker"
    });
    await expect(me.json()).resolves.toEqual({
      authenticated: false
    });
  });

  it("serves normalized Telegram login config", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/admin/auth-config",
      {},
      {
        ...env,
        TELEGRAM_BOT_USERNAME: "@PersonalAgentBot"
      }
    );

    await expect(response.json()).resolves.toEqual({
      botUsername: "PersonalAgentBot",
      configured: true
    });
  });

  it("does not expose invalid Telegram login config to the widget", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/admin/auth-config",
      {},
      {
        ...env,
        TELEGRAM_BOT_USERNAME: "configure_bot_username"
      }
    );

    await expect(response.json()).resolves.toEqual({
      botUsername: null,
      configured: false
    });
  });

  it("rejects webhook requests with invalid secret", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "wrong"
        },
        body: JSON.stringify({
          update_id: 1
        })
      },
      env
    );

    expect(response.status).toBe(401);
  });

  it("rejects webhook requests when secret is not configured", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          update_id: 1
        })
      },
      {
        ...env,
        TELEGRAM_WEBHOOK_SECRET: ""
      }
    );

    expect(response.status).toBe(401);
  });

  it("ignores non-owner webhook updates without writing bot data", async () => {
    const { app, repositories } = createTestApp();
    const response = await postWebhook(app, {
      update_id: 1,
      message: {
        message_id: 1,
        from: {
          id: 999,
          first_name: "Other"
        },
        chat: {
          id: 999
        },
        text: "hello"
      }
    });

    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true
    });
    expect(repositories.runs).toHaveLength(0);
  });

  it("uses LLM fallback for owner messages that do not match commands", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const response = await postWebhook(app, ownerUpdate("hello"));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      accepted: true,
      runId: "id-1"
    });
    expect(repositories.runs[0]?.status).toBe("succeeded");
    expect(repositories.toolCalls.map((call) => call.toolName)).toEqual([
      "llm_chat_completion"
    ]);
    expect(telegramClient.messages[0]?.text).toBe("LLM 回复：hello");
  });

  it("lets the LLM fallback call web_search and fetch_url tools", async () => {
    const { app, repositories, searchClient, urlFetcher, telegramClient } =
      createTestApp();

    await postWebhook(app, ownerUpdate("搜索网页 Cloudflare Workers", 1));
    await postWebhook(app, ownerUpdate("读取网页 https://example.com", 2));

    expect(searchClient.queries).toEqual(["Cloudflare Workers"]);
    expect(urlFetcher.urls).toEqual(["https://example.com"]);
    expect(repositories.toolCalls.map((call) => call.toolName)).toEqual([
      "llm_chat_completion",
      "web_search",
      "llm_chat_completion",
      "llm_chat_completion",
      "fetch_url",
      "llm_chat_completion"
    ]);
    expect(telegramClient.messages[0]?.text).toContain("工具结果已处理");
    expect(telegramClient.messages[1]?.text).toContain("工具结果已处理");
  });

  it("fails clearly when LLM tool rounds exceed the configured limit", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify(ownerUpdate("搜索网页 超过轮次"))
      },
      {
        ...env,
        LLM_MAX_TOOL_ROUNDS: "0"
      }
    );

    expect(response.status).toBe(200);
    expect(repositories.runs[0]).toMatchObject({
      status: "failed",
      error: "LLM tool round limit exceeded"
    });
    expect(telegramClient.messages[0]?.text).toBe(
      "执行失败：LLM tool round limit exceeded"
    );
  });

  it("serves agent diagnostics and test endpoints", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    const config = await app.request(
      "/api/admin/agent-config",
      {
        headers: { Cookie: cookie }
      },
      env
    );
    const llm = await app.request(
      "/api/admin/agent-config/test-llm",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({ prompt: "hello" })
      },
      env
    );
    const search = await app.request(
      "/api/admin/agent-config/test-search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({ query: "Cloudflare Workers" })
      },
      env
    );

    await expect(config.json()).resolves.toMatchObject({
      llmConfigured: true,
      llmBaseUrl: "https://llm.example",
      llmModel: "test-model",
      braveSearchConfigured: true
    });
    await expect(llm.json()).resolves.toMatchObject({
      ok: true,
      output: "LLM 回复：hello"
    });
    await expect(search.json()).resolves.toMatchObject({
      ok: true,
      results: [
        {
          title: "Cloudflare Workers",
          url: "https://developers.cloudflare.com/workers/"
        }
      ]
    });
    expect(repositories.runs[0]).toMatchObject({ status: "succeeded" });
  });

  it("requires admin session for D1 readiness diagnostics", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/admin/diagnostics/d1", {}, env);

    expect(response.status).toBe(401);
  });

  it("reports D1 readiness and missing migration tables", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    const response = await app.request(
      "/api/admin/diagnostics/d1",
      {
        headers: { Cookie: cookie }
      },
      {
        ...env,
        DB: createFakeD1Database(["runs", "tool_calls"])
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      migrationCommand: "npm run d1:migrate:worker:remote",
      requiredTables: expect.arrayContaining([
        { name: "runs", present: true },
        { name: "skills", present: false }
      ]),
      missingTables: expect.arrayContaining(["skills", "schedules"])
    });
  });

  it("reports Brave search diagnostics failures without exposing secrets", async () => {
    const { app } = createTestApp({ searchFails: true });
    const response = await app.request(
      "/api/admin/agent-config/test-search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: await ownerCookie()
        },
        body: JSON.stringify({ query: "Cloudflare Workers" })
      },
      env
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "search failed"
    });
  });

  it("handles todo create, list, and complete commands", async () => {
    const { app, repositories, telegramClient } = createTestApp();

    await postWebhook(app, ownerUpdate("新增待办：写第三阶段测试", 1));
    await postWebhook(app, ownerUpdate("列出我的待办", 2));
    await postWebhook(app, ownerUpdate("完成待办 1", 3));

    expect(repositories.todos[0]).toMatchObject({
      id: 1,
      title: "写第三阶段测试",
      status: "completed"
    });
    expect(telegramClient.messages.map((message) => message.text)).toEqual([
      "已创建待办 #1：写第三阶段测试",
      "未完成待办：\n#1 写第三阶段测试",
      "已完成待办 #1：写第三阶段测试"
    ]);
  });

  it("saves, searches, requests approval, and deletes memory after confirm", async () => {
    const { app, repositories, telegramClient } = createTestApp();

    await postWebhook(app, ownerUpdate("记住：我喜欢 Cloudflare D1", 1));
    await postWebhook(app, ownerUpdate("搜索记忆 Cloudflare", 2));
    await postWebhook(app, ownerUpdate("删除记忆 1", 3));
    await postWebhook(app, ownerUpdate("确认 123456", 4));

    expect(repositories.memories[0]).toMatchObject({
      id: 1,
      status: "deleted"
    });
    expect(repositories.approvals[0]).toMatchObject({
      action: "delete_memory",
      status: "executed",
      code: "123456"
    });
    expect(telegramClient.messages.map((message) => message.text)).toEqual([
      "已保存记忆 #1。",
      "找到这些记忆：\n#1 我喜欢 Cloudflare D1",
      "删除记忆 #1 需要确认。发送：确认 123456",
      "已删除记忆 #1。"
    ]);
  });

  it("marks the run failed when Telegram sendMessage fails without returning 5xx", async () => {
    const { app, repositories } = createTestApp({ telegramFails: true });
    const response = await postWebhook(app, ownerUpdate("新增待办：会写入但回复失败"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      accepted: true,
      runId: "id-1"
    });
    expect(repositories.todos[0]?.title).toBe("会写入但回复失败");
    expect(repositories.runs[0]).toMatchObject({
      status: "failed",
      error: "send failed"
    });
  });

  it("serves authenticated admin lists", async () => {
    const { app } = createTestApp();
    await postWebhook(app, ownerUpdate("新增待办：从 Admin 查看"));
    const session = await signSession({
      user: {
        id: 1229,
        username: "shixiong",
        firstName: "Shixiong"
      },
      secret: env.ADMIN_SESSION_SECRET
    });
    const response = await app.request(
      "/api/admin/todos",
      {
        headers: {
          Cookie: buildSessionCookie({ value: session })
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: 1,
          title: "从 Admin 查看",
          status: "open",
          createdAt: 1002,
          completedAt: null
        }
      ]
    });
  });

  it("rejects unauthenticated admin run detail requests", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/admin/runs/id-1", {}, env);

    expect(response.status).toBe(401);
  });

  it("returns 404 for missing admin run details", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/admin/runs/missing",
      {
        headers: {
          Cookie: await ownerCookie()
        }
      },
      env
    );

    expect(response.status).toBe(404);
  });

  it("serves aggregated admin run details", async () => {
    const { app, repositories } = createTestApp();
    await postWebhook(app, ownerUpdate("新增待办：Trace 详情", 72));
    const runId = repositories.runs[0]?.id ?? "";

    repositories.skillRouteDecisions.push({
      id: "route-1",
      runId,
      ownerTgUserId: 1229,
      inputText: "新增待办：Trace 详情",
      triggerType: "none",
      matchedSkillId: null,
      matchedSkillVersionId: null,
      confidence: null,
      reason: "fallback",
      createdAt: 1010
    });
    repositories.skillRuns.push({
      id: "skill-run-1",
      runId,
      ownerTgUserId: 1229,
      skillId: "coach",
      skillVersionId: "skill-version-1",
      status: "succeeded",
      inputText: "Trace 详情",
      outputText: "ok",
      error: null,
      createdAt: 1011,
      updatedAt: 1012
    });
    repositories.workflowRuns.push({
      id: "workflow-run-1",
      runId,
      ownerTgUserId: 1229,
      skillId: "morning",
      skillVersionId: "workflow-version-1",
      cloudflareWorkflowInstanceId: "cf-1",
      source: "telegram",
      status: "succeeded",
      inputText: "Trace 详情",
      outputText: "done",
      error: null,
      createdAt: 1013,
      updatedAt: 1014
    });
    repositories.scheduleExecutions.push({
      id: "schedule-execution-1",
      scheduleId: "schedule-1",
      ownerTgUserId: 1229,
      runId,
      scheduledFor: 1000,
      status: "succeeded",
      outputText: "done",
      error: null,
      createdAt: 1015,
      updatedAt: 1016
    });

    const response = await app.request(
      `/api/admin/runs/${runId}`,
      {
        headers: {
          Cookie: await ownerCookie()
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: {
        id: runId,
        status: "succeeded",
        messageText: "新增待办：Trace 详情"
      },
      toolCalls: [
        {
          runId,
          toolName: "create_todo",
          status: "succeeded"
        }
      ],
      skillRouteDecision: {
        id: "route-1",
        runId
      },
      skillRun: {
        id: "skill-run-1",
        runId
      },
      workflowRun: {
        id: "workflow-run-1",
        runId
      },
      scheduleExecution: {
        id: "schedule-execution-1",
        runId
      }
    });
  });

  it("creates schedules and runs them on demand", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const cookie = await ownerCookie();
    const create = await app.request(
      "/api/admin/schedules",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          name: "daily todos",
          commandText: "列出我的待办",
          enabled: true,
          timezone: "Asia/Shanghai",
          cadence: "daily",
          timeOfDay: "09:30",
          daysOfWeek: []
        })
      },
      env
    );

    expect(create.status).toBe(201);
    expect(repositories.schedules).toHaveLength(1);

    const runNow = await app.request(
      `/api/admin/schedules/${repositories.schedules[0]?.id}/run-now`,
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(runNow.status).toBe(200);
    expect(repositories.scheduleExecutions[0]).toMatchObject({
      status: "succeeded"
    });
    expect(telegramClient.messages[0]?.text).toBe("当前没有未完成待办。");
  });

  it("updates, toggles, and deletes schedules", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    await app.request(
      "/api/admin/schedules",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          name: "daily todos",
          commandText: "列出我的待办",
          enabled: true,
          timezone: "Asia/Shanghai",
          cadence: "daily",
          timeOfDay: "09:30",
          daysOfWeek: []
        })
      },
      env
    );
    const scheduleId = repositories.schedules[0]?.id as string;

    const update = await app.request(
      `/api/admin/schedules/${scheduleId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          name: "weekly todos",
          commandText: "列出我的待办",
          enabled: true,
          timezone: "Asia/Shanghai",
          cadence: "weekly",
          timeOfDay: "10:15",
          daysOfWeek: [1, 3]
        })
      },
      env
    );
    const disable = await app.request(
      `/api/admin/schedules/${scheduleId}/disable`,
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(disable.status).toBe(200);
    expect(repositories.schedules[0]?.enabled).toBe(false);

    const enable = await app.request(
      `/api/admin/schedules/${scheduleId}/enable`,
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(enable.status).toBe(200);
    expect(repositories.schedules[0]?.enabled).toBe(true);

    const remove = await app.request(
      `/api/admin/schedules/${scheduleId}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(repositories.schedules[0]).toMatchObject({
      name: "weekly todos",
      cadence: "weekly",
      daysOfWeek: [1, 3],
      enabled: false
    });
    expect(repositories.schedules[0]?.deletedAt).not.toBeNull();

    const secondRemove = await app.request(
      `/api/admin/schedules/${scheduleId}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(secondRemove.status).toBe(200);

    const listAfterRemove = await app.request(
      "/api/admin/skills",
      {
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    await expect(listAfterRemove.json()).resolves.toMatchObject({
      items: []
    });
  });

  it("rejects weekly schedules without selected days", async () => {
    const { app, repositories } = createTestApp();
    const response = await app.request(
      "/api/admin/schedules",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: await ownerCookie()
        },
        body: JSON.stringify({
          name: "weekly todos",
          commandText: "列出我的待办",
          enabled: true,
          timezone: "Asia/Shanghai",
          cadence: "weekly",
          timeOfDay: "09:30",
          daysOfWeek: []
        })
      },
      env
    );

    expect(response.status).toBe(400);
    expect(repositories.schedules).toHaveLength(0);
  });

  it("polls due schedules once and skips disabled schedules", async () => {
    const repositories = createFakeRepositories();
    const telegramClient = createFakeTelegramClient();
    repositories.schedules.push(
      {
        id: "due",
        ownerTgUserId: 1229,
        name: "due",
        commandText: "列出我的待办",
        enabled: true,
        timezone: "Asia/Shanghai",
        cadence: "daily",
        timeOfDay: "09:00",
        daysOfWeek: [],
        nextRunAt: 1000,
        lastRunAt: null,
        deletedAt: null,
        createdAt: 900,
        updatedAt: 900
      },
      {
        id: "disabled",
        ownerTgUserId: 1229,
        name: "disabled",
        commandText: "列出我的待办",
        enabled: false,
        timezone: "Asia/Shanghai",
        cadence: "daily",
        timeOfDay: "09:00",
        daysOfWeek: [],
        nextRunAt: 1000,
        lastRunAt: null,
        deletedAt: null,
        createdAt: 900,
        updatedAt: 900
      }
    );
    let id = 0;
    const options = {
      repositories,
      telegramClient,
      now: () => 1000,
      generateId: () => {
        id += 1;
        return `schedule-id-${id}`;
      },
      generateApprovalCode: () => "123456"
    };

    const first = await runScheduled(env, options, 1000);
    const second = await runScheduled(env, options, 1000);

    expect(first).toEqual({ checked: 1, started: 1 });
    expect(second).toEqual({ checked: 0, started: 0 });
    expect(repositories.scheduleExecutions).toHaveLength(1);
    expect(repositories.runs).toHaveLength(1);
    expect(telegramClient.messages).toHaveLength(1);
  });

  it("creates, updates, publishes, disables, and deletes skills", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    const manifest = chatSkillManifest({
      id: "brief",
      triggerPhrases: ["简报"]
    });
    const create = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({ manifest })
      },
      env
    );

    expect(create.status).toBe(201);
    const updatedManifest = {
      ...manifest,
      name: "brief updated",
      instructions: "新版指令"
    };
    const update = await app.request(
      "/api/admin/skills/brief",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({ manifest: updatedManifest })
      },
      env
    );
    const publish = await app.request(
      "/api/admin/skills/brief/publish",
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(update.status).toBe(200);
    await expect(publish.json()).resolves.toMatchObject({
      ok: true,
      version: 1
    });
    expect(repositories.skillVersions[0]?.manifest.name).toBe("brief updated");

    await app.request(
      "/api/admin/skills/brief/disable",
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(repositories.skills[0]?.enabled).toBe(false);

    await app.request(
      "/api/admin/skills/brief",
      {
        method: "DELETE",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(repositories.skills[0]?.deletedAt).not.toBeNull();

    const secondRemove = await app.request(
      "/api/admin/skills/brief",
      {
        method: "DELETE",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(secondRemove.status).toBe(200);
  });

  it("allows workflow drafts and publishes supported workflow steps", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    const create = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          manifest: workflowSkillManifest("workflow-draft")
        })
      },
      env
    );
    const publish = await app.request(
      "/api/admin/skills/workflow-draft/publish",
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(create.status).toBe(201);
    expect(repositories.skills[0]?.draftManifest.kind).toBe("workflow");
    expect(publish.status).toBe(200);
    await expect(publish.json()).resolves.toMatchObject({
      ok: true,
      version: 1
    });
  });

  it("rejects publishing workflow skills with unsupported steps", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          manifest: workflowSkillManifest("unsupported-workflow", [
            {
              id: "rag",
              type: "rag_search",
              input: {
                prompt: "hello"
              }
            }
          ])
        })
      },
      env
    );
    const publish = await app.request(
      "/api/admin/skills/unsupported-workflow/publish",
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(publish.status).toBe(400);
    await expect(publish.json()).resolves.toEqual({
      error: "Unsupported workflow step types: rag_search"
    });
  });

  it("rejects publishing workflow steps without required allowed tools", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          manifest: workflowSkillManifest("unauthorized-workflow", [
            {
              id: "search",
              type: "web_search",
              input: {
                query: "Cloudflare"
              }
            }
          ])
        })
      },
      env
    );

    const publish = await app.request(
      "/api/admin/skills/unauthorized-workflow/publish",
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );

    expect(publish.status).toBe(400);
    await expect(publish.json()).resolves.toEqual({
      error: "Workflow steps require allowed tools: web_search"
    });
  });

  it("starts published workflow skills from Telegram without inline execution", async () => {
    const { app, repositories, workflowCreates, telegramClient } =
      createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: workflowSkillManifest("morning-flow", [
        {
          id: "list",
          type: "tool",
          input: {
            text: "列出我的待办"
          }
        }
      ]),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "workflow-version",
      createdAt: 1001
    });

    const response = await postWebhook(
      app,
      ownerUpdate("/skill morning-flow hello")
    );

    expect(response.status).toBe(200);
    expect(repositories.workflowRuns).toHaveLength(1);
    expect(workflowCreates).toHaveLength(1);
    expect(repositories.workflowSteps).toHaveLength(0);
    expect(telegramClient.messages[0]?.text).toContain("已开始执行 workflow");
  });

  it("marks workflow runs failed when the workflow starter rejects", async () => {
    const { app, repositories, workflowCreates, telegramClient } =
      createTestApp({ workflowStarterFails: true });
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: workflowSkillManifest("broken-flow"),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "workflow-version",
      createdAt: 1001
    });

    const response = await postWebhook(
      app,
      ownerUpdate("/skill broken-flow hello")
    );

    expect(response.status).toBe(200);
    expect(workflowCreates).toHaveLength(0);
    expect(telegramClient.messages[0]?.text).toBe(
      "执行失败：workflow start failed"
    );
    expect(repositories.workflowRuns[0]).toMatchObject({
      status: "failed",
      error: "workflow start failed"
    });
    expect(repositories.runs[0]).toMatchObject({
      status: "failed",
      error: "workflow start failed"
    });
    expect(repositories.toolCalls[0]).toMatchObject({
      status: "failed",
      error: "workflow start failed"
    });
  });

  it("executes workflow runner steps and records workflow trace", async () => {
    const repositories = createFakeRepositories();
    const telegramClient = createFakeTelegramClient();
    const manifest = {
      ...workflowSkillManifest("runner-flow", [
        {
          id: "create",
          type: "tool",
          input: {
            text: "新增待办：跑 workflow"
          }
        },
        {
          id: "wait",
          type: "wait",
          input: {
            durationMs: 1
          }
        },
        {
          id: "notify",
          type: "send_telegram",
          input: {
            text: "workflow done"
          }
        }
      ]),
      allowedTools: ["create_todo" as const]
    };
    await repositories.createRun({
      id: "run-workflow",
      ownerTgUserId: 1229,
      chatId: 1229,
      updateId: null,
      messageText: "workflow",
      createdAt: 1000,
      updatedAt: 1000
    });
    await repositories.createWorkflowRun({
      id: "workflow-run",
      runId: "run-workflow",
      ownerTgUserId: 1229,
      skillId: "runner-flow",
      skillVersionId: "version-1",
      cloudflareWorkflowInstanceId: "workflow-run",
      source: "telegram",
      status: "running",
      inputText: "workflow",
      outputText: null,
      error: null,
      createdAt: 1000,
      updatedAt: 1000
    });
    let id = 0;

    await executeWorkflowSkillRun({
      payload: {
        workflowRunId: "workflow-run",
        runId: "run-workflow",
        ownerTgUserId: 1229,
        skillId: "runner-flow",
        skillVersionId: "version-1",
        manifest,
        inputText: "workflow"
      },
      runtime: {
        repositories,
        telegramClient,
        now: () => 2000 + id,
        generateId: () => {
          id += 1;
          return `workflow-id-${id}`;
        },
        generateApprovalCode: () => "123456",
        maxToolRounds: 3
      }
    });

    expect(repositories.workflowSteps).toHaveLength(3);
    expect(repositories.workflowRuns[0]).toMatchObject({
      status: "succeeded"
    });
    expect(repositories.toolCalls[0]).toMatchObject({
      toolName: "create_todo",
      status: "succeeded"
    });
    expect(telegramClient.messages[0]).toEqual({
      chatId: 1229,
      text: "workflow done"
    });
  });

  it("rejects skill manifests with unknown allowed tools", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    const response = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          manifest: {
            ...chatSkillManifest({ id: "invalid-tools" }),
            allowedTools: ["list_todos", "unknown_tool"]
          }
        })
      },
      env
    );

    expect(response.status).toBe(400);
  });

  it("executes workflow llm, web_search, and fetch_url steps", async () => {
    const repositories = createFakeRepositories();
    const telegramClient = createFakeTelegramClient();
    const llmClient = createFakeLlmClient();
    const searchClient = createFakeSearchClient();
    const urlFetcher = createFakeUrlFetcher();
    const manifest = {
      ...workflowSkillManifest("research-flow", [
        {
          id: "think",
          type: "llm",
          input: {
            prompt: "hello"
          }
        },
        {
          id: "search",
          type: "web_search",
          input: {
            query: "Cloudflare Workers"
          }
        },
        {
          id: "fetch",
          type: "fetch_url",
          input: {
            text: "https://example.com"
          }
        }
      ]),
      allowedTools: ["web_search" as const, "fetch_url" as const]
    };
    await repositories.createRun({
      id: "run-research",
      ownerTgUserId: 1229,
      chatId: 1229,
      updateId: null,
      messageText: "research",
      createdAt: 1000,
      updatedAt: 1000
    });
    await repositories.createWorkflowRun({
      id: "workflow-research",
      runId: "run-research",
      ownerTgUserId: 1229,
      skillId: "research-flow",
      skillVersionId: "version-1",
      cloudflareWorkflowInstanceId: "workflow-research",
      source: "telegram",
      status: "running",
      inputText: "research",
      outputText: null,
      error: null,
      createdAt: 1000,
      updatedAt: 1000
    });
    let id = 0;

    await executeWorkflowSkillRun({
      payload: {
        workflowRunId: "workflow-research",
        runId: "run-research",
        ownerTgUserId: 1229,
        skillId: "research-flow",
        skillVersionId: "version-1",
        manifest,
        inputText: "research"
      },
      runtime: {
        repositories,
        telegramClient,
        llmClient,
        searchClient,
        urlFetcher,
        maxToolRounds: 3,
        now: () => 3000 + id,
        generateId: () => {
          id += 1;
          return `research-id-${id}`;
        },
        generateApprovalCode: () => "123456"
      }
    });

    expect(repositories.workflowSteps.map((step) => step.stepType)).toEqual([
      "llm",
      "web_search",
      "fetch_url"
    ]);
    expect(searchClient.queries).toEqual(["Cloudflare Workers"]);
    expect(urlFetcher.urls).toEqual(["https://example.com"]);
    expect(repositories.workflowRuns[0]).toMatchObject({
      status: "succeeded"
    });
  });

  it("keeps published versions immutable after draft edits", async () => {
    const { repositories } = createTestApp();
    const original = await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: chatSkillManifest({
        id: "immutable",
        instructions: "原始指令"
      }),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: original.id,
      versionId: "version-1",
      createdAt: 1001
    });
    await repositories.updateSkillDraft({
      ownerTgUserId: 1229,
      id: original.id,
      manifest: chatSkillManifest({
        id: "immutable",
        instructions: "草稿新指令"
      }),
      updatedAt: 1002
    });

    expect(repositories.skillVersions[0]?.manifest.instructions).toBe(
      "原始指令"
    );
    expect(repositories.skills[0]?.draftManifest.instructions).toBe(
      "草稿新指令"
    );
  });

  it("routes explicit skill messages and records skill trace", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: chatSkillManifest({
        id: "coach",
        instructions: "像教练一样回答。"
      }),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: "coach",
      versionId: "coach-v1",
      createdAt: 1001
    });

    const response = await postWebhook(app, ownerUpdate("/skill coach 今天怎么做"));

    expect(response.status).toBe(200);
    expect(repositories.skillRouteDecisions[0]).toMatchObject({
      triggerType: "explicit_id",
      matchedSkillId: "coach",
      matchedSkillVersionId: "coach-v1"
    });
    expect(repositories.skillRuns[0]).toMatchObject({
      skillId: "coach",
      skillVersionId: "coach-v1",
      status: "succeeded"
    });
    expect(repositories.toolCalls.map((call) => call.toolName)).toEqual([
      "llm_chat_completion"
    ]);
    expect(telegramClient.messages[0]?.text).toBe("LLM 回复：今天怎么做");
  });

  it("marks admin test runs failed when skill execution fails", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: chatSkillManifest({
        id: "failing-skill",
        allowedTools: ["create_todo"]
      }),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: "failing-skill",
      versionId: "failing-skill-v1",
      createdAt: 1001
    });
    repositories.createTodo = async () => {
      throw new Error("D1 write failed");
    };

    const response = await app.request(
      "/api/admin/skills/failing-skill/test-run",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          input: "新增待办：失败"
        })
      },
      env
    );

    expect(response.status).toBe(500);
    expect(repositories.skillRuns.at(-1)).toMatchObject({
      status: "failed",
      error: "D1 write failed"
    });
    expect(repositories.runs.at(-1)).toMatchObject({
      status: "failed",
      error: "D1 write failed"
    });
    expect(repositories.toolCalls.at(-1)).toMatchObject({
      toolName: "skill_test_run",
      status: "failed",
      error: "D1 write failed"
    });
  });

  it("routes trigger phrases and falls back when skills are disabled", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: chatSkillManifest({
        id: "planner",
        triggerPhrases: ["规划"]
      }),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "planner-v1",
      createdAt: 1001
    });

    await postWebhook(app, ownerUpdate("规划 明天任务", 1));
    await repositories.setSkillEnabled({
      ownerTgUserId: 1229,
      id: skill.id,
      enabled: false,
      updatedAt: 1002
    });
    await postWebhook(app, ownerUpdate("规划 后天任务", 2));

    expect(repositories.skillRouteDecisions[0]).toMatchObject({
      triggerType: "trigger_phrase",
      matchedSkillId: "planner"
    });
    expect(repositories.skillRouteDecisions[1]).toMatchObject({
      triggerType: "none",
      matchedSkillId: null
    });
    expect(telegramClient.messages[1]?.text).toBe("LLM 回复：规划 后天任务");
  });

  it("blocks tools outside skill allowlists and keeps destructive approval required", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    await repositories.createSkill({
      ownerTgUserId: 1229,
      manifest: chatSkillManifest({
        id: "memory-safe",
        allowedTools: ["search_memory"]
      }),
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: "memory-safe",
      versionId: "memory-safe-v1",
      createdAt: 1001
    });

    await postWebhook(app, ownerUpdate("记住：不能保存", 1));
    await postWebhook(app, ownerUpdate("/skill memory-safe 删除记忆 1", 2));

    expect(repositories.memories).toHaveLength(1);
    expect(repositories.memories[0]?.content).toBe("不能保存");
    expect(repositories.approvals).toHaveLength(0);
    expect(telegramClient.messages[1]?.text).toBe(
      "这个 skill 不允许使用工具 delete_memory_request。"
    );
  });

  it("keeps fetch_url constrained to http and https URLs", async () => {
    const repositories = createFakeRepositories();
    const urlFetcher = createUrlFetcher({
      defaultMaxBytes: 200000,
      fetcher: async () => new Response("ok")
    });

    await expect(
      executeAgentTool({
        runId: "run-fetch",
        ownerTgUserId: 1229,
        toolName: "fetch_url",
        args: { url: "file:///etc/passwd" },
        runtime: {
          repositories,
          urlFetcher,
          now: () => 1000,
          generateId: () => "id-fetch",
          generateApprovalCode: () => "123456"
        },
        record: false
      })
    ).rejects.toThrow("fetch_url only supports http and https URLs");
  });

  it("rejects oversized fetch_url responses", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("too "));
        controller.enqueue(new TextEncoder().encode("large"));
      },
      cancel() {
        canceled = true;
      }
    });
    const urlFetcher = createUrlFetcher({
      defaultMaxBytes: 1,
      fetcher: async () => new Response(body)
    });

    await expect(
      urlFetcher.fetchUrl({ url: "https://example.com" })
    ).rejects.toThrow("fetch_url exceeded 1 bytes");
    expect(canceled).toBe(true);
  });

  it("ignores unsupported Telegram updates and records failed tool calls on command errors", async () => {
    const { app, repositories } = createTestApp();
    const ignored = await postWebhook(app, {
      update_id: 88,
      my_chat_member: {
        chat: {
          id: 1229
        }
      }
    });

    await expect(ignored.json()).resolves.toEqual({
      ok: true,
      ignored: true
    });

    repositories.createTodo = async () => {
      throw new Error("D1 write failed");
    };
    const failed = await postWebhook(app, ownerUpdate("新增待办：失败路径", 89));

    expect(failed.status).toBe(200);
    expect(repositories.runs.at(-1)).toMatchObject({
      status: "failed",
      error: "D1 write failed"
    });
    expect(repositories.toolCalls.at(-1)).toMatchObject({
      toolName: "command_execution",
      status: "failed",
      error: "D1 write failed"
    });
  });
});
