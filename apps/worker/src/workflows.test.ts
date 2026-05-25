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

describe("workflow execution", () => {
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

});
