import { describe, expect, it } from "vitest";
import { runScheduled } from "./app.js";
import {
  createTestApp,
  env,
  ownerCookie,
  ownerUpdate,
  ownerCallback,
  postWebhook
} from "./test-helpers/fakeRepositories.js";

function plannerContent(
  steps: Array<{ title: string; toolPolicy?: string; description?: string }>
) {
  return JSON.stringify({
    title: "测试长任务",
    steps: steps.map((step) => ({
      title: step.title,
      description: step.description ?? step.title,
      toolPolicy: step.toolPolicy ?? "none",
      successCriteria: "完成"
    })),
    userConfirmationRequired: false,
    confirmationQuestion: null
  });
}

describe("long tasks", () => {
  it("creates, plans, and executes complex Telegram requests", async () => {
    const { app, repositories, telegramClient, searchClient } = createTestApp();

    const response = await postWebhook(
      app,
      ownerUpdate("请调研 Cloudflare Workers 并总结一个报告")
    );

    expect(response.status).toBe(200);
    expect(repositories.longTasks).toHaveLength(1);
    expect(repositories.longTaskSteps).toHaveLength(2);
    expect(repositories.longTaskEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["classified", "planned", "step_started"])
    );
    expect(telegramClient.messages[0]?.text).toContain("已创建长任务");
    expect(telegramClient.messages[0]?.text).toContain("长任务");
    expect(telegramClient.messages[0]?.text).toContain("已完成");
    expect(searchClient.queries).toEqual(["Cloudflare Workers"]);
  });

  it("keeps simple fallback on the ordinary LLM path", async () => {
    const { app, repositories, telegramClient } = createTestApp();

    await postWebhook(app, ownerUpdate("你好", 1));

    expect(repositories.longTasks).toHaveLength(0);
    expect(telegramClient.messages[0]?.text).toBe("LLM 回复：你好");
  });

  it("supports Telegram cancel controls", async () => {
    const { app, repositories, telegramClient } = createTestApp({
      plannerContent: plannerContent([
        { title: "步骤 1" },
        { title: "步骤 2" },
        { title: "步骤 3" },
        { title: "步骤 4" },
        { title: "步骤 5" }
      ])
    });
    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结一个报告", 1));
    const taskId = repositories.longTasks[0]?.id as string;

    await postWebhook(app, ownerCallback(`long_task_action_cancel_${taskId}`, 1));

    expect(telegramClient.messages.at(-1)?.text).toContain(taskId);
    expect(repositories.longTasks[0]).toMatchObject({
      status: "cancelled"
    });
  });

  it("rejects Telegram controls that mutate completed tasks", async () => {
    const { app, repositories } = createTestApp();
    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结一个报告", 1));
    const taskId = repositories.longTasks[0]?.id as string;

    await postWebhook(app, ownerCallback(`long_task_action_cancel_${taskId}`, 1));

    expect(repositories.longTasks[0]).toMatchObject({ status: "succeeded" });
  });

  it("serves Admin list/detail and links run detail to long task", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结一个报告"));
    const taskId = repositories.longTasks[0]?.id as string;
    const runId = repositories.runs[0]?.id as string;

    const list = await app.request(
      "/api/admin/long-tasks",
      { headers: { Cookie: cookie } },
      env
    );
    const detail = await app.request(
      `/api/admin/long-tasks/${taskId}`,
      { headers: { Cookie: cookie } },
      env
    );
    const runDetail = await app.request(
      `/api/admin/runs/${runId}`,
      { headers: { Cookie: cookie } },
      env
    );

    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      items: [{ id: taskId }]
    });
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      task: { id: taskId },
      steps: expect.any(Array),
      events: expect.any(Array)
    });
    expect(runDetail.status).toBe(200);
    await expect(runDetail.json()).resolves.toMatchObject({
      longTask: { id: taskId }
    });
  });

  it("serves Admin pause/resume/cancel actions for active tasks", async () => {
    const { app, repositories } = createTestApp({
      plannerContent: plannerContent([
        { title: "步骤 1" },
        { title: "步骤 2" },
        { title: "步骤 3" },
        { title: "步骤 4" },
        { title: "步骤 5" },
        { title: "步骤 6" },
        { title: "步骤 7" }
      ])
    });
    const cookie = await ownerCookie();
    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结一个报告"));
    const taskId = repositories.longTasks[0]?.id as string;

    const pause = await app.request(
      `/api/admin/long-tasks/${taskId}/pause`,
      { method: "POST", headers: { Cookie: cookie } },
      env
    );
    const resume = await app.request(
      `/api/admin/long-tasks/${taskId}/resume`,
      { method: "POST", headers: { Cookie: cookie } },
      env
    );
    const cancel = await app.request(
      `/api/admin/long-tasks/${taskId}/cancel`,
      { method: "POST", headers: { Cookie: cookie } },
      env
    );

    expect(pause.status).toBe(200);
    expect(resume.status).toBe(200);
    expect(cancel.status).toBe(200);
    expect(repositories.longTasks[0]).toMatchObject({ status: "cancelled" });
    expect(repositories.longTaskEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["paused", "resumed", "cancelled"])
    );
  });

  it("rejects Admin actions that mutate completed tasks", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结一个报告"));
    const taskId = repositories.longTasks[0]?.id as string;

    const cancel = await app.request(
      `/api/admin/long-tasks/${taskId}/cancel`,
      { method: "POST", headers: { Cookie: cookie } },
      env
    );

    expect(cancel.status).toBe(409);
    expect(repositories.longTasks[0]).toMatchObject({ status: "succeeded" });
  });

  it("lets Admin resume a blocked destructive step without getting stuck", async () => {
    const { app, repositories, telegramClient } = createTestApp({
      plannerContent: plannerContent([
        { title: "删除危险数据", toolPolicy: "destructive" },
        { title: "总结处理结果" }
      ])
    });
    const cookie = await ownerCookie();
    await postWebhook(app, ownerUpdate("请规划 删除危险数据 并总结报告"));
    const taskId = repositories.longTasks[0]?.id as string;

    expect(repositories.longTasks[0]).toMatchObject({
      status: "waiting_for_user"
    });
    expect(repositories.longTaskSteps[0]).toMatchObject({ status: "blocked" });

    const resume = await app.request(
      `/api/admin/long-tasks/${taskId}/resume`,
      { method: "POST", headers: { Cookie: cookie } },
      env
    );

    expect(resume.status).toBe(200);
    expect(repositories.longTaskSteps[0]).toMatchObject({ status: "skipped" });
    expect(repositories.longTasks[0]).toMatchObject({ status: "succeeded" });
    expect(telegramClient.messages.at(-1)?.text).toContain("已完成");
  });

  it("fails the task when the planner returns invalid, empty, or oversized plans", async () => {
    for (const planner of [
      "not json",
      plannerContent([]),
      plannerContent(
        Array.from({ length: 13 }, (_, index) => ({ title: `步骤 ${index + 1}` }))
      )
    ]) {
      const { app, repositories } = createTestApp({ plannerContent: planner });

      await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结报告"));

      expect(repositories.longTasks[0]?.status).toBe("failed");
      expect(repositories.longTaskEvents.map((event) => event.eventType)).toContain(
        "failed"
      );
    }
  });

  it("marks tasks succeeded when the final step exactly reaches the tick limit", async () => {
    const { app, repositories } = createTestApp({
      plannerContent: plannerContent([
        { title: "步骤 1" },
        { title: "步骤 2" },
        { title: "步骤 3" }
      ])
    });

    await postWebhook(app, ownerUpdate("请调研 Cloudflare Workers 并总结报告"));

    expect(repositories.longTasks[0]).toMatchObject({ status: "succeeded" });
  });

  it("Cron resumes stale running long tasks", async () => {
    const { repositories, telegramClient, llmClient, searchClient, urlFetcher } =
      createTestApp();
    await repositories.createRun({
      id: "run-long",
      ownerTgUserId: 1229,
      chatId: 1229,
      updateId: null,
      messageText: "long",
      createdAt: 1000,
      updatedAt: 1000
    });
    await repositories.createLongTask({
      id: "task-long",
      runId: "run-long",
      ownerTgUserId: 1229,
      title: "Cron task",
      originalInput: "请调研",
      status: "running",
      complexityScore: 0.8,
      plannerReason: "test",
      currentStepId: null,
      outputText: null,
      error: null,
      replanCount: 0,
      telegramChatId: 1229,
      telegramMessageId: 1,
      createdAt: 1000,
      updatedAt: 1000
    });
    await repositories.createLongTaskStep({
      id: "step-long",
      longTaskId: "task-long",
      ownerTgUserId: 1229,
      position: 1,
      title: "总结",
      description: "总结",
      status: "pending",
      toolPolicy: "none",
      successCriteria: "完成",
      inputJson: "{}",
      outputJson: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: 1000
    });

    const result = await runScheduled(
      env,
      {
        repositories,
        telegramClient,
        llmClient,
        searchClient,
        urlFetcher,
        now: () => 40000,
        generateId: () => "cron-id",
        generateApprovalCode: () => "123456"
      },
      40000
    );

    expect(result.longTasks).toEqual({ checked: 1, resumed: 1 });
    expect(repositories.longTaskSteps[0]).toMatchObject({
      status: "succeeded"
    });
    expect(repositories.longTasks[0]).toMatchObject({
      status: "succeeded"
    });
    expect(telegramClient.messages.at(-1)?.text).toContain("已完成");
  });
});
