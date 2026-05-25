import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp, runScheduled } from "./app.js";
import { executeAgentTool } from "./agent.js";
import { createUrlFetcher, type SearchClient, type UrlFetcher } from "./externalTools.js";
import { type LlmChatCompletionOutput, type LlmClient, type LlmMessage } from "./llm.js";
import { executeWorkflowSkillRun } from "./workflowExecutor.js";
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
  postWebhook,
  workflowSkillManifest
} from "./test-helpers/fakeRepositories.js";

describe("skills lifecycle and workflow start", () => {
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

});
