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

describe("skill routing and execution", () => {
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

});
