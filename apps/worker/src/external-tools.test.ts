import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp, runScheduled } from "./app.js";
import { executeAgentTool } from "./agent.js";
import { createUrlFetcher, type SearchClient, type UrlFetcher } from "./externalTools.js";
import { type LlmChatCompletionOutput, type LlmClient, type LlmMessage } from "./llm.js";
import { type TelegramClient } from "./telegram.js";
import {
  skillPackageFiles,
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

describe("external tool constraints", () => {
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

    const result = await urlFetcher.fetchUrl({ url: "https://example.com" });
    expect(result.isTruncated).toBe(true);
    expect(result.bytesRead).toBe(1);
    expect(canceled).toBe(true);
  });

  it("does not follow redirects for fetch_url", async () => {
    const urlFetcher = createUrlFetcher({
      defaultMaxBytes: 1000,
      fetcher: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/next" }
        })
    });

    await expect(
      urlFetcher.fetchUrl({ url: "https://example.com" })
    ).rejects.toThrow("fetch_url redirect_url_not_allowed");
  });

  it("rejects non-text fetch_url responses", async () => {
    const urlFetcher = createUrlFetcher({
      defaultMaxBytes: 1000,
      fetcher: async () =>
        new Response("{}", {
          headers: { "Content-Type": "application/json" }
        })
    });

    await expect(
      urlFetcher.fetchUrl({ url: "https://example.com" })
    ).rejects.toThrow("fetch_url unsupported content type");
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
