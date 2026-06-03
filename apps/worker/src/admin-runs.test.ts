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

describe("admin data and run traces", () => {
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
      matchedSkillName: null,
      matchedSkillVersionId: null,
      confidence: null,
      reason: "fallback",
      candidatesJson: "[]",
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
    repositories.plannerRouteDecisions.push({
      id: "planner-route-1",
      runId,
      ownerTgUserId: 1229,
      policyVersion: "planner-route-v1",
      inputTextRedacted: "Trace 详情",
      inputHash: "hash",
      mode: "none",
      confidence: 0.95,
      reason: "test planner route",
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
        maxQueries: 0
      },
      fetchPolicy: {
        explicitAllowedUrls: [],
        allowSearchResultUrls: false,
        allowedDomains: [],
        maxUrls: 0
      },
      signals: ["test"],
      classifierUsed: false,
      question: null,
      createdAt: 1017
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
      plannerRouteDecision: {
        id: "planner-route-1",
        runId,
        mode: "none"
      },
      skillRun: {
        id: "skill-run-1",
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

  it("allows todo CRUD operations", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();

    const create = await app.request(
      "/api/admin/todos",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          title: "Buy milk",
          dueAt: 2000000000000
        })
      },
      env
    );

    expect(create.status).toBe(201);
    const createdTodo = await create.json() as any;
    expect(createdTodo.title).toBe("Buy milk");
    expect(createdTodo.dueAt).toBe(2000000000000);
    expect(repositories.todos).toHaveLength(1);
    expect(repositories.todos[0]?.title).toBe("Buy milk");

    const list = await app.request(
      "/api/admin/todos",
      {
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(list.status).toBe(200);
    const listResult = await list.json() as any;
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0].id).toBe(createdTodo.id);

    const update = await app.request(
      `/api/admin/todos/${createdTodo.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          title: "Buy whole milk",
          status: "completed",
          dueAt: 3000000000000
        })
      },
      env
    );
    expect(update.status).toBe(200);
    const updatedTodo = await update.json() as any;
    expect(updatedTodo.title).toBe("Buy whole milk");
    expect(updatedTodo.status).toBe("completed");
    expect(updatedTodo.dueAt).toBe(3000000000000);
    expect(updatedTodo.completedAt).not.toBeNull();

    const del = await app.request(
      `/api/admin/todos/${createdTodo.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(del.status).toBe(200);
    expect(repositories.todos).toHaveLength(0);
  });

});
