import { type Context } from "telegraf";
import { type ProgressEvent } from "../services/progress.js";

const telegramTextLimit = 4096;
const finalFirstChunkLimit = 4000;
const maxProgressEvents = 8;
const typingIntervalMs = 4_000;

export interface TelegramProgressUpdater {
  onProgress(event: ProgressEvent): Promise<void>;
  finish(output: string): Promise<void>;
  stop(): void;
}

function eventToLine(event: ProgressEvent): string {
  if (event.type === "tool_start") {
    return `调用工具：${event.toolName ?? event.message}`;
  }

  if (event.type === "tool_done") {
    const prefix = event.outcome === "failed" ? "工具失败" : "工具完成";

    return `${prefix}：${event.toolName ?? event.message}`;
  }

  if (event.type === "workflow_step") {
    if (event.outcome === "succeeded") {
      return `工作流步骤完成：${event.workflowStep ?? event.message}`;
    }

    if (event.outcome === "failed") {
      return `工作流步骤失败：${event.workflowStep ?? event.message}`;
    }

    return `工作流步骤：${event.workflowStep ?? event.message}`;
  }

  return event.message;
}

function buildProgressText(events: ProgressEvent[]): string {
  const lines = events.slice(-maxProgressEvents).map(eventToLine);

  return ["正在处理...", ...lines.map((line) => `- ${line}`)].join("\n");
}

function splitTelegramText(text: string): string[] {
  if (text.length <= finalFirstChunkLimit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, finalFirstChunkLimit));
    remaining = remaining.slice(finalFirstChunkLimit);
  }

  return chunks;
}

async function safeReply(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text);
  } catch (error) {
    console.error("Failed to send Telegram reply chunk:", error);
  }
}

export function createTelegramProgressUpdater(input: {
  ctx: Context;
  messageId: number;
  minIntervalMs?: number;
}): TelegramProgressUpdater {
  const minIntervalMs = input.minIntervalMs ?? 1_000;
  const events: ProgressEvent[] = [];
  let lastRenderedText = "正在处理...";
  let latestQueuedText = "正在处理...";
  let lastEditAt = 0;
  let pendingTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let editQueue: Promise<boolean> = Promise.resolve(true);

  const typingTimer = setInterval(() => {
    void input.ctx.sendChatAction("typing").catch((error) => {
      console.error("Failed to send Telegram typing action:", error);
    });
  }, typingIntervalMs);
  void input.ctx.sendChatAction("typing").catch((error) => {
    console.error("Failed to send Telegram typing action:", error);
  });

  async function edit(text: string, force = false): Promise<boolean> {
    if (!force && (stopped || text === latestQueuedText)) {
      return true;
    }

    latestQueuedText = text;
    editQueue = editQueue
      .catch(() => false)
      .then(async () => {
        if (!force && (stopped || text === lastRenderedText)) {
          return true;
        }

        try {
          await input.ctx.telegram.editMessageText(
            input.ctx.chat?.id,
            input.messageId,
            undefined,
            text.slice(0, telegramTextLimit)
          );
          lastRenderedText = text;
          lastEditAt = Date.now();
          return true;
        } catch (error) {
          console.error("Failed to edit Telegram progress message:", error);
          return false;
        }
      });

    return editQueue;
  }

  function scheduleEdit(text: string): void {
    if (stopped || text === latestQueuedText) {
      return;
    }

    const elapsed = Date.now() - lastEditAt;

    if (elapsed >= minIntervalMs) {
      void edit(text);
      return;
    }

    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void edit(text);
    }, minIntervalMs - elapsed);
  }

  function clearTimers(): void {
    clearInterval(typingTimer);

    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function stop(): void {
    stopped = true;
    clearTimers();
  }

  return {
    async onProgress(event) {
      events.push(event);
      scheduleEdit(buildProgressText(events));
    },
    async finish(output) {
      clearTimers();

      const chunks = splitTelegramText(output);
      const [firstChunk, ...restChunks] = chunks;

      const firstSent = await edit(firstChunk ?? output, true);
      stopped = true;

      if (!firstSent && firstChunk) {
        await safeReply(input.ctx, firstChunk);
      }

      for (const chunk of restChunks) {
        await safeReply(input.ctx, chunk);
      }
    },
    stop
  };
}
