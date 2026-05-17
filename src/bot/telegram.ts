import { type Context, Telegraf } from "telegraf";
import { env } from "../config/env.js";
import {
  createRunningRun,
  markRunFailed,
  markRunSucceeded
} from "../db/runs.js";
import { ingestDocument } from "../services/documentIngestion.js";
import { handleUserTextMessage } from "../services/messageHandler.js";

const documentImportErrorMessage = "抱歉，文档导入失败。请稍后再试。";
const maxUploadFileSizeBytes = 2 * 1024 * 1024;
const supportedDocumentExtensions = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv"
]);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

function getSourceType(fileName: string): "text" | "markdown" {
  const extension = getFileExtension(fileName);

  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }

  return "text";
}

async function downloadTelegramFile(input: {
  ctx: Context;
  fileId: string;
}): Promise<string> {
  const fileLink = await input.ctx.telegram.getFileLink(input.fileId);
  const response = await fetch(fileLink);

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new TextDecoder("utf-8").decode(arrayBuffer);
}

async function replySafely(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text);
  } catch (error) {
    console.error("Failed to send Telegram reply:", error);
  }
}

export function createTelegramBot(): Telegraf {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    await replySafely(ctx, "你好，我是你的个人 Agent。直接发送文本消息即可开始。");
  });

  bot.on("document", async (ctx) => {
    const startedAt = Date.now();
    const document = ctx.message.document;
    const fileId = document.file_id;
    const fileName = document.file_name ?? "telegram-document.txt";
    const mimeType = document.mime_type ?? null;
    const fileSize = document.file_size ?? null;
    const userId = String(ctx.from?.id ?? "unknown");
    const chatId = String(ctx.chat.id);
    const metadata = {
      telegram_message_id: ctx.message.message_id,
      username: ctx.from?.username ?? null,
      originalFileName: fileName,
      mimeType,
      fileSize,
      telegramFileId: fileId
    };
    const run = await createRunningRun({
      userId,
      chatId,
      model: env.OPENAI_MODEL,
      input: `[document_upload] ${fileName}`,
      metadata,
      createdAt: new Date(startedAt)
    });

    try {
      const extension = getFileExtension(fileName);

      if (!supportedDocumentExtensions.has(extension)) {
        const output =
          "当前只支持 .txt、.md、.markdown、.json、.csv 文本文件";
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, output);
        await markRunFailed({
          id: run.id,
          error: "Unsupported document file type",
          latencyMs,
          output,
          metadata
        });
        return;
      }

      if (fileSize !== null && fileSize > maxUploadFileSizeBytes) {
        const output = "文件过大，当前只支持 2MB 以下的文本文件";
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, output);
        await markRunFailed({
          id: run.id,
          error: "Document file too large",
          latencyMs,
          output,
          metadata
        });
        return;
      }

      const content = await downloadTelegramFile({
        ctx,
        fileId
      });

      if (!content.trim()) {
        const output = "文件内容为空";
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, output);
        await markRunFailed({
          id: run.id,
          error: "Document content is empty",
          latencyMs,
          output,
          metadata
        });
        return;
      }

      const result = await ingestDocument({
        userId,
        title: fileName,
        content,
        sourceType: getSourceType(fileName),
        metadata
      });
      const output = result.skippedDuplicate
        ? "这个文档之前已经导入过，已跳过重复导入。"
        : [
            `已导入文档：${result.title}`,
            `切分片段：${result.chunkCount}`,
            "你现在可以问：根据我上传的文档，xxx 是什么？"
          ].join("\n");
      const latencyMs = Date.now() - startedAt;

      await replySafely(ctx, output);
      await markRunSucceeded({
        id: run.id,
        output,
        latencyMs,
        metadata
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorMessage = toErrorMessage(error);

      console.error("Document import failed:", error);
      await replySafely(ctx, documentImportErrorMessage);
      await markRunFailed({
        id: run.id,
        error: errorMessage,
        latencyMs,
        output: null,
        metadata
      });
    }
  });

  bot.on("text", async (ctx) => {
    const message = ctx.message.text;
    const userId = String(ctx.from?.id ?? "unknown");
    const chatId = String(ctx.chat.id);
    const metadata = {
      telegram_message_id: ctx.message.message_id,
      username: ctx.from?.username ?? null,
      is_command: message.startsWith("/")
    };

    const result = await handleUserTextMessage({
      input: message,
      userId,
      chatId,
      metadata
    });

    await replySafely(ctx, result.output);
  });

  bot.catch((error) => {
    console.error("Unhandled Telegram bot error:", error);
  });

  return bot;
}
