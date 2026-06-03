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
  ownerCallback,
  ownerCookie,
  ownerUpdate,
  postWebhook
} from "./test-helpers/fakeRepositories.js";

describe("skill routing and execution", () => {
  it("routes explicit skill messages and records skill trace", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "coach",
        instructions: "像教练一样回答。"
      }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "coach-v1",
      createdAt: 1001
    });

    const response = await postWebhook(app, ownerUpdate("/skill coach 今天怎么做"));

    expect(response.status).toBe(200);
    expect(repositories.skillRouteDecisions[0]).toMatchObject({
      triggerType: "explicit_name",
      matchedSkillId: skill.id,
      matchedSkillName: "coach",
      matchedSkillVersionId: "coach-v1"
    });
    expect(repositories.skillRuns[0]).toMatchObject({
      skillId: skill.id,
      skillVersionId: "coach-v1",
      status: "succeeded"
    });
    expect(repositories.toolCalls.map((call) => call.toolName)).toEqual([
      "llm_chat_completion"
    ]);
    expect(telegramClient.messages[0]?.text).toBe("LLM 回复：今天怎么做");
  });

  it("routes by published skill name, not unpublished draft name or internal id", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "coach",
        instructions: "像教练一样回答。"
      }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "coach-v1",
      createdAt: 1001
    });
    await repositories.updateSkillDraft({
      ownerTgUserId: 1229,
      id: skill.id,
      files: skillPackageFiles({
        name: "mentor",
        instructions: "未发布新版指令。"
      }),
      enabled: true,
      updatedAt: 1002
    });

    await postWebhook(app, ownerUpdate("/skill coach 今天怎么做", 1));
    await postWebhook(app, ownerUpdate("/skill mentor 今天怎么做", 2));
    await postWebhook(app, ownerUpdate(`/skill ${skill.id} 今天怎么做`, 3));

    expect(repositories.skillRouteDecisions[0]).toMatchObject({
      triggerType: "explicit_name",
      matchedSkillName: "coach",
      matchedSkillVersionId: "coach-v1"
    });
    expect(telegramClient.messages[0]?.text).toBe("LLM 回复：今天怎么做");
    expect(telegramClient.messages[1]?.text).toBe("没有找到 skill mentor");
    expect(telegramClient.messages[2]?.text).toBe(`没有找到 skill ${skill.id}`);
  });

  it("marks admin test runs failed when skill execution fails", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "failing-skill",
        allowedTools: ["create_todo"]
      }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "failing-skill-v1",
      createdAt: 1001
    });
    repositories.createTodo = async () => {
      throw new Error("D1 write failed");
    };

    const response = await app.request(
      `/api/admin/skills/${skill.id}/test-run`,
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

  it("routes semantically by name and description and falls back when skills are disabled", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "planner",
        description: "规划任务和后续行动"
      }),
      enabled: true,
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
      triggerType: "semantic",
      matchedSkillId: skill.id,
      matchedSkillName: "planner"
    });
    expect(repositories.skillRouteDecisions[1]).toMatchObject({
      triggerType: "none",
      matchedSkillId: null
    });
    expect(telegramClient.messages[1]?.text).toContain("已创建长任务");
    expect(repositories.longTasks).toHaveLength(1);
  });

  it("asks for confirmation before running low-confidence semantic skill matches", async () => {
    const { app, repositories, telegramClient } = createTestApp({
      semanticConfidence: 0.62
    });
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "planner",
        description: "规划任务和后续行动"
      }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
      versionId: "planner-v1",
      createdAt: 1001
    });

    await postWebhook(app, ownerUpdate("规划 今天怎么做", 1));

    const pendingRunId = repositories.runs[0]?.id;
    expect(repositories.skillRuns).toHaveLength(0);
    expect(repositories.skillRouteDecisions[0]).toMatchObject({
      triggerType: "semantic",
      matchedSkillName: "planner",
      confidence: 0.62
    });
    expect(telegramClient.messages[0]?.text).toBe(
      "我猜你可能是想执行技能「planner」，是否确认？"
    );
    expect((telegramClient.messages[0] as any).replyMarkup).toEqual({
      inline_keyboard: [
        [
          { text: "确认执行", callback_data: `sc_${pendingRunId}` },
          { text: "取消", callback_data: `sx_${pendingRunId}` }
        ]
      ]
    });

    await postWebhook(app, ownerCallback(`sc_${pendingRunId}`));

    expect(repositories.skillRuns).toHaveLength(1);
    expect(repositories.skillRuns[0]).toMatchObject({
      skillId: skill.id,
      skillVersionId: "planner-v1",
      status: "succeeded"
    });
    expect(telegramClient.messages[0]?.text).toBe("确认执行 planner，处理中...");
    expect(telegramClient.messages[1]?.text).toBe("LLM 回复：规划 今天怎么做");
  });

  it("blocks tools outside skill allowlists and keeps destructive approval required", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    const skill = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({
        name: "memory-safe",
        allowedTools: ["search_memory"]
      }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: skill.id,
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
