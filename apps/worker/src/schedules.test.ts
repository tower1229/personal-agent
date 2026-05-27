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

describe("schedules", () => {
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

    expect(first).toEqual({
      checked: 1,
      started: 1,
      longTasks: { checked: 0, resumed: 0 }
    });
    expect(second).toEqual({
      checked: 0,
      started: 0,
      longTasks: { checked: 0, resumed: 0 }
    });
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

});
