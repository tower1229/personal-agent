import { type Context, Telegraf } from "telegraf";
import { generateReply } from "../agent/index.js";
import { env } from "../config/env.js";
import {
  approveRequest,
  expireOldApprovals,
  getLatestPendingApprovalForUser,
  markApprovalExecuted,
  rejectRequest
} from "../db/approvals.js";
import { createRun } from "../db/runs.js";
import { type RunStatus } from "../db/schema.js";
import { ingestDocument } from "../services/documentIngestion.js";
import { executeRegisteredTool } from "../tools/registry.js";
import {
  DailyBriefWorkflowError,
  runDailyBriefWorkflow
} from "../workflows/dailyBrief.js";

const friendlyErrorMessage =
  "抱歉，我刚刚处理消息时遇到问题。请稍后再试。";
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

function isDailyBriefTrigger(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return (
    normalized === "生成今日简报" ||
    normalized === "今日简报" ||
    normalized === "daily brief"
  );
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

function formatApprovalExecutionReply(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "deletedMemory" in result &&
    result.deletedMemory &&
    typeof result.deletedMemory === "object" &&
    "content" in result.deletedMemory
  ) {
    return `已删除记忆：${String(result.deletedMemory.content)}`;
  }

  return "已执行确认的操作。";
}

async function handleApprovalDecision(input: {
  ctx: Context;
  message: string;
  userId: string;
  chatId: string;
}): Promise<boolean> {
  const normalizedMessage = input.message.trim();

  if (normalizedMessage !== "确认" && normalizedMessage !== "取消") {
    return false;
  }

  await expireOldApprovals({
    olderThanMs: 24 * 60 * 60 * 1000
  });

  const pendingApproval = await getLatestPendingApprovalForUser({
    userId: input.userId,
    chatId: input.chatId
  });

  if (!pendingApproval) {
    return false;
  }

  if (normalizedMessage === "取消") {
    await rejectRequest({
      id: pendingApproval.id,
      userId: input.userId,
      chatId: input.chatId
    });
    await replySafely(input.ctx, "已取消这次操作。");
    return true;
  }

  const approved = await approveRequest({
    id: pendingApproval.id,
    userId: input.userId,
    chatId: input.chatId
  });

  const result = await executeRegisteredTool({
    toolName: approved.toolName,
    argsJson: approved.toolArgsJson,
    context: {
      userId: input.userId,
      chatId: input.chatId,
      runId: approved.runId
    },
    allowHighRiskExecution: true
  });

  await markApprovalExecuted({
    id: approved.id,
    userId: input.userId,
    chatId: input.chatId
  });

  await replySafely(input.ctx, formatApprovalExecutionReply(result));
  return true;
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

    try {
      const extension = getFileExtension(fileName);

      if (!supportedDocumentExtensions.has(extension)) {
        const output =
          "当前只支持 .txt、.md、.markdown、.json、.csv 文本文件";
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, output);
        await recordRunSafely({
          userId,
          chatId,
          message: `[document_upload] ${fileName}`,
          output,
          status: "failed",
          latencyMs,
          error: "Unsupported document file type",
          metadata
        });
        return;
      }

      if (fileSize !== null && fileSize > maxUploadFileSizeBytes) {
        const output = "文件过大，当前只支持 2MB 以下的文本文件";
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, output);
        await recordRunSafely({
          userId,
          chatId,
          message: `[document_upload] ${fileName}`,
          output,
          status: "failed",
          latencyMs,
          error: "Document file too large",
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
        await recordRunSafely({
          userId,
          chatId,
          message: `[document_upload] ${fileName}`,
          output,
          status: "failed",
          latencyMs,
          error: "Document content is empty",
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
      await recordRunSafely({
        userId,
        chatId,
        message: `[document_upload] ${fileName}`,
        output,
        status: "succeeded",
        latencyMs,
        error: null,
        metadata
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorMessage = toErrorMessage(error);

      console.error("Document import failed:", error);
      await replySafely(ctx, documentImportErrorMessage);
      await recordRunSafely({
        userId,
        chatId,
        message: `[document_upload] ${fileName}`,
        output: null,
        status: "failed",
        latencyMs,
        error: errorMessage,
        metadata
      });
    }
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
      const handledApproval = await handleApprovalDecision({
        ctx,
        message,
        userId,
        chatId
      });

      if (handledApproval) {
        const latencyMs = Date.now() - startedAt;

        await recordRunSafely({
          userId,
          chatId,
          message,
          output: "approval decision handled",
          status: "succeeded",
          latencyMs,
          error: null,
          metadata
        });
        return;
      }

      if (isDailyBriefTrigger(message)) {
        const result = await runDailyBriefWorkflow({
          userId,
          chatId,
          triggerMessage: message
        });
        const latencyMs = Date.now() - startedAt;

        await replySafely(ctx, result.output);
        await recordRunSafely({
          userId,
          chatId,
          message,
          output: result.output,
          status: "succeeded",
          latencyMs,
          error: null,
          metadata: {
            ...metadata,
            workflow_id: result.workflowId
          }
        });
        return;
      }

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
        metadata:
          error instanceof DailyBriefWorkflowError
            ? {
                ...metadata,
                workflow_id: error.workflowId
              }
            : metadata
      });
    }
  });

  bot.catch((error) => {
    console.error("Unhandled Telegram bot error:", error);
  });

  return bot;
}
