import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp } from "./app.js";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
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

function createFakeRepositories(): AgentRepositories & {
  runs: RunRecord[];
  toolCalls: ToolCallRecord[];
  todos: TodoRecord[];
  memories: MemoryRecord[];
  approvals: ApprovalRequestRecord[];
} {
  const state = {
    runs: [] as RunRecord[],
    toolCalls: [] as ToolCallRecord[],
    todos: [] as TodoRecord[],
    memories: [] as MemoryRecord[],
    approvals: [] as ApprovalRequestRecord[],
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
          createdAt: 1001,
          completedAt: null
        }
      ]
    });
  });
});
