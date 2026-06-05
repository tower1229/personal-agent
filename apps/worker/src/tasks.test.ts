import { describe, expect, it } from "vitest";
import { createTestApp, ownerUpdate, postWebhook, createFakeRepositories, createFakeTelegramClient, env } from "./test-helpers/fakeRepositories.js";
import { TaskRuntime } from "./TaskRuntime.js";
import { type BotRuntime } from "./bot.js";

describe("Task Ledger and Background Tasks", () => {
  it("spawns a dummy task and updates in-place progress", async () => {
    const repositories = createFakeRepositories();
    const telegramClient = createFakeTelegramClient();
    
    let idCounter = 1;
    const runtime: BotRuntime = {
      repositories,
      telegramClient,
      maxToolRounds: 5,
      now: () => 1000,
      generateId: () => `task-${idCounter++}`,
      generateApprovalCode: () => "123456"
    };

    const taskRuntime = new TaskRuntime(runtime, 1229);
    const { taskId, bgPromise } = await taskRuntime.spawnTask({
      title: "Test Task",
      command: "/start task Test Task",
      type: "dummy",
      contextJson: {},
      executionLogic: async (id, updateProgress) => {
        await updateProgress("Step 1");
        await updateProgress("Step 2");
        return { success: true };
      }
    });

    expect(taskId).toBe("task-1");
    
    // It should immediately create task in db
    expect(repositories.tasks).toHaveLength(1);
    expect(["queued", "running"]).toContain(repositories.tasks[0]?.status);
    
    await bgPromise;

    // It should be succeeded
    expect(repositories.tasks[0]?.status).toBe("succeeded");
    expect(repositories.tasks[0]?.resultJson).toBe(JSON.stringify({ success: true }));

    // Telegram client should have sent and edited messages
    expect(telegramClient.messages).toHaveLength(1);
    expect(telegramClient.messages[0]?.text).toContain("任务已完成：Test Task");
  });

  it("handles bot commands for listing, showing, and canceling tasks", async () => {
    const { app, repositories, telegramClient } = createTestApp();
    
    // Add a couple of fake tasks
    repositories.tasks.push(
      {
        id: "t1",
        ownerTgUserId: 1229,
        type: "dummy",
        status: "queued",
        title: "Task 1",
        command: "/start task",
        contextJson: "{}",
        resultJson: null,
        error: null,
        runId: null,
        createdAt: 1000,
        updatedAt: 1000
      },
      {
        id: "t2",
        ownerTgUserId: 1229,
        type: "dummy",
        status: "running",
        title: "Task 2",
        command: "/start task 2",
        contextJson: "{}",
        resultJson: null,
        error: null,
        runId: null,
        createdAt: 1000,
        updatedAt: 1000
      }
    );

    // /list tasks
    await postWebhook(app, ownerUpdate("/list tasks", 1));
    expect(telegramClient.messages[0]?.text).toContain("最近的任务");
    expect(telegramClient.messages[0]?.text).toContain("#t1 [queued] Task 1");

    // /show task t1
    await postWebhook(app, ownerUpdate("/show task t1", 2));
    expect(telegramClient.messages[1]?.text).toContain("任务详情：");
    expect(telegramClient.messages[1]?.text).toContain("ID: t1");
    expect(telegramClient.messages[1]?.text).toContain("状态: queued");

    // /cancel task t1
    await postWebhook(app, ownerUpdate("/cancel task t1", 3));
    expect(telegramClient.messages[2]?.text).toContain("已标记任务 #t1 为取消状态");
    expect(repositories.tasks[0]?.status).toBe("cancelled");

    // /cancel task that doesn't exist
    await postWebhook(app, ownerUpdate("/cancel task none", 4));
    expect(telegramClient.messages[3]?.text).toContain("没有找到任务 #none");
  });
});
