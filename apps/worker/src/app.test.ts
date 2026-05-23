import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp } from "./app.js";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type SkillVersionRecord,
  type TodoRecord,
  type ToolCallRecord
} from "./repositories.js";
import { type TelegramClient } from "./telegram.js";
import { type WorkerEnv } from "./types.js";

const env: WorkerEnv = {
  DB: {} as D1Database,
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_BOT_USERNAME: "personal_agent_bot",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
  OWNER_TG_USER_ID: "1229",
  ADMIN_SESSION_SECRET: "session-secret"
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
  allowedTools?: Array<
    | "create_todo"
    | "list_todos"
    | "complete_todo"
    | "save_memory"
    | "search_memory"
    | "delete_memory_request"
  >;
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

function workflowSkillManifest(id: string) {
  return {
    ...chatSkillManifest({ id }),
    kind: "workflow" as const
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
    async recordToolCall(input) {
      state.toolCalls.push(input);
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
        .filter((skill) => skill.ownerTgUserId === ownerTgUserId)
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
        return null;
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

function createTestApp(options: { telegramFails?: boolean } = {}) {
  const repositories = createFakeRepositories();
  const telegramClient = createFakeTelegramClient({
    fail: options.telegramFails
  });
  let id = 0;
  const app = createWorkerApp({
    repositories,
    telegramClient,
    now: () => 1000 + id,
    generateId: () => {
      id += 1;
      return `id-${id}`;
    },
    generateApprovalCode: () => "123456"
  });

  return { app, repositories, telegramClient };
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

  it("creates a run for owner messages and replies with fallback text", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const response = await postWebhook(app, ownerUpdate("hello"));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      accepted: true,
      runId: "id-1"
    });
    expect(repositories.runs[0]?.status).toBe("succeeded");
    expect(repositories.toolCalls[0]?.toolName).toBe("fallback");
    expect(telegramClient.messages[0]?.text).toBe(
      "Cloudflare 核心 Bot 已接入，LLM/skill 将在后续阶段开启。"
    );
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
  });

  it("allows workflow drafts but rejects publishing them", async () => {
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
    expect(publish.status).toBe(400);
    await expect(publish.json()).resolves.toEqual({
      error: "Workflow skills cannot be published yet"
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
    expect(repositories.toolCalls[0]?.toolName).toBe("chat_skill_reply");
    expect(telegramClient.messages[0]?.text).toContain("像教练一样回答。");
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
    expect(telegramClient.messages[1]?.text).toBe(
      "Cloudflare 核心 Bot 已接入，LLM/skill 将在后续阶段开启。"
    );
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
