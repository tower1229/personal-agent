import { type BotRuntime } from "./bot.js";

export interface SpawnTaskOptions<T> {
  title: string;
  command: string;
  type: string;
  contextJson: any;
  executionLogic: (taskId: string, updateProgress: (msg: string) => Promise<void>) => Promise<T>;
}

export class TaskRuntime {
  constructor(private botRuntime: BotRuntime, private ownerTgUserId: number) {}

  async spawnTask<T>(
    options: SpawnTaskOptions<T>
  ): Promise<{ taskId: string; bgPromise: Promise<void> }> {
    const taskId = this.botRuntime.generateId();
    const now = this.botRuntime.now();

    await this.botRuntime.repositories.createTask({
      id: taskId,
      ownerTgUserId: this.ownerTgUserId,
      type: options.type,
      status: "queued",
      title: options.title,
      command: options.command,
      contextJson: JSON.stringify(options.contextJson),
      resultJson: null,
      error: null,
      runId: null,
      createdAt: now,
      updatedAt: now
    });

    const bgPromise = (async () => {
      // 1. Send initial progress message to Telegram
      let progressMessageId: number | null = null;
      try {
        const msg = await this.botRuntime.telegramClient.sendMessage({
          chatId: this.ownerTgUserId, // assuming chatId == ownerTgUserId
          text: `⏳ 任务已启动：${options.title}\nID: ${taskId}\n进度: 排队中...`
        });
        progressMessageId = msg.messageId;
      } catch (err) {
        // ignore
      }

      const updateProgress = async (msg: string) => {
        if (progressMessageId) {
          // Check if task is cancelled before updating
          const currentTask = await this.botRuntime.repositories.getTask({
            ownerTgUserId: this.ownerTgUserId,
            id: taskId
          });
          if (currentTask && currentTask.status === "cancelled") {
            throw new Error("Task was cancelled");
          }

          await this.botRuntime.telegramClient.editMessageText({
            chatId: this.ownerTgUserId,
            messageId: progressMessageId,
            text: `⏳ 任务执行中：${options.title}\nID: ${taskId}\n进度: ${msg}`,
            replyMarkup: { inline_keyboard: [] }
          }).catch(() => {});
        }
      };

      await this.botRuntime.repositories.updateTask({
        ownerTgUserId: this.ownerTgUserId,
        id: taskId,
        patch: { status: "running" },
        updatedAt: this.botRuntime.now()
      });

      try {
        const result = await options.executionLogic(taskId, updateProgress);
        
        // Final check for cancellation before success
        const currentTask = await this.botRuntime.repositories.getTask({
          ownerTgUserId: this.ownerTgUserId,
          id: taskId
        });
        if (currentTask && currentTask.status === "cancelled") {
          throw new Error("Task was cancelled");
        }
        
        await this.botRuntime.repositories.updateTask({
          ownerTgUserId: this.ownerTgUserId,
          id: taskId,
          patch: { 
            status: "succeeded", 
            resultJson: JSON.stringify(result),
            completedAt: this.botRuntime.now()
          },
          updatedAt: this.botRuntime.now()
        });

        if (progressMessageId) {
          await this.botRuntime.telegramClient.editMessageText({
            chatId: this.ownerTgUserId,
            messageId: progressMessageId,
            text: `✅ 任务已完成：${options.title}\nID: ${taskId}`,
            replyMarkup: { inline_keyboard: [] }
          }).catch(() => {});
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Only update if not already cancelled
        const currentTask = await this.botRuntime.repositories.getTask({
          ownerTgUserId: this.ownerTgUserId,
          id: taskId
        });
        
        if (currentTask && currentTask.status === "cancelled") {
          if (progressMessageId) {
            await this.botRuntime.telegramClient.editMessageText({
              chatId: this.ownerTgUserId,
              messageId: progressMessageId,
              text: `🛑 任务已取消：${options.title}\nID: ${taskId}`,
              replyMarkup: { inline_keyboard: [] }
            }).catch(() => {});
          }
          return;
        }

        await this.botRuntime.repositories.updateTask({
          ownerTgUserId: this.ownerTgUserId,
          id: taskId,
          patch: { 
            status: "failed", 
            error: errorMessage,
            completedAt: this.botRuntime.now()
          },
          updatedAt: this.botRuntime.now()
        });

        if (progressMessageId) {
          await this.botRuntime.telegramClient.editMessageText({
            chatId: this.ownerTgUserId,
            messageId: progressMessageId,
            text: `❌ 任务失败：${options.title}\nID: ${taskId}\n错误: ${errorMessage}`,
            replyMarkup: { inline_keyboard: [] }
          }).catch(() => {});
        }
      }
    })();

    return { taskId, bgPromise };
  }
}
