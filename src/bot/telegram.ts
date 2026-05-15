import { type Context, Telegraf } from "telegraf";
import { generateReply } from "../agent/index.js";
import { env } from "../config/env.js";
import { createRun } from "../db/runs.js";
import { type RunStatus } from "../db/schema.js";

const friendlyErrorMessage =
  "抱歉，我刚刚处理消息时遇到问题。请稍后再试。";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function replySafely(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text);
  } catch (error) {
    console.error("Failed to send Telegram reply:", error);
  }
}

async function recordRunSafely(input: {
  userId: string;
  chatId: string;
  message: string;
  output: string | null;
  status: RunStatus;
  latencyMs: number;
  error: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await createRun({
      userId: input.userId,
      chatId: input.chatId,
      model: env.OPENAI_MODEL,
      input: input.message,
      output: input.output,
      status: input.status,
      latencyMs: input.latencyMs,
      error: input.error,
      metadataJson: JSON.stringify(input.metadata),
      createdAt: new Date()
    });
  } catch (error) {
    console.error("Failed to record run:", error);
  }
}

export function createTelegramBot(): Telegraf {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    await replySafely(ctx, "你好，我是你的个人 Agent。直接发送文本消息即可开始。");
  });

  bot.on("text", async (ctx) => {
    const startedAt = Date.now();
    const message = ctx.message.text;
    const userId = String(ctx.from?.id ?? "unknown");
    const chatId = String(ctx.chat.id);
    const metadata = {
      telegram_message_id: ctx.message.message_id,
      username: ctx.from?.username ?? null,
      is_command: message.startsWith("/")
    };

    try {
      const output = await generateReply({
        input: message,
        userId,
        chatId
      });
      const latencyMs = Date.now() - startedAt;

      await replySafely(ctx, output);
      await recordRunSafely({
        userId,
        chatId,
        message,
        output,
        status: "succeeded",
        latencyMs,
        error: null,
        metadata
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorMessage = toErrorMessage(error);

      console.error("Agent run failed:", error);
      await replySafely(ctx, friendlyErrorMessage);
      await recordRunSafely({
        userId,
        chatId,
        message,
        output: null,
        status: "failed",
        latencyMs,
        error: errorMessage,
        metadata
      });
    }
  });

  bot.catch((error) => {
    console.error("Unhandled Telegram bot error:", error);
  });

  return bot;
}
