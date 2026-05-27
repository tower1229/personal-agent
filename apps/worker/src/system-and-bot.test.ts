import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp, runScheduled } from "./app.js";
import { executeAgentTool } from "./agent.js";
import { createUrlFetcher, type SearchClient, type UrlFetcher } from "./externalTools.js";
import { type LlmChatCompletionOutput, type LlmClient, type LlmMessage } from "./llm.js";
import { type TelegramClient } from "./telegram.js";
import {
  chatSkillManifest,
  createFakeD1Database,
  createFakeLlmClient,
  createFakeRepositories,
  createFakeSearchClient,
  createFakeTelegramClient,
  createFakeUrlFetcher,
  createTestApp,
  env,
  ownerCookie,
  ownerUpdate,
  postWebhook
} from "./test-helpers/fakeRepositories.js";

describe("worker system and bot commands", () => {
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

});
