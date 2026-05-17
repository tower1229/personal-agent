import { generateReply } from "../agent/index.js";
import {
  approveRequest,
  expireOldApprovals,
  getLatestPendingApprovalForUser,
  markApprovalExecuted,
  rejectRequest
} from "../db/approvals.js";
import { createRun } from "../db/runs.js";
import { type RunStatus } from "../db/schema.js";
import { executeRegisteredTool } from "../tools/registry.js";
import { sanitizeTelegramText } from "../utils/sanitizeTelegramText.js";
import {
  DailyBriefWorkflowError,
  runDailyBriefWorkflow
} from "../workflows/dailyBrief.js";
import { env } from "../config/env.js";

const friendlyErrorMessage =
  "抱歉，我刚刚处理消息时遇到问题。请稍后再试。";

export interface HandleUserTextMessageInput {
  input: string;
  userId: string;
  chatId: string;
  metadata: Record<string, unknown>;
}

export interface HandleUserTextMessageResult {
  output: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isDailyBriefTrigger(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return (
    normalized === "生成今日简报" ||
    normalized === "今日简报" ||
    normalized === "daily brief"
  );
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
  message: string;
  userId: string;
  chatId: string;
}): Promise<string | null> {
  const normalizedMessage = input.message.trim();

  if (normalizedMessage !== "确认" && normalizedMessage !== "取消") {
    return null;
  }

  await expireOldApprovals({
    olderThanMs: 24 * 60 * 60 * 1000
  });

  const pendingApproval = await getLatestPendingApprovalForUser({
    userId: input.userId,
    chatId: input.chatId
  });

  if (!pendingApproval) {
    return null;
  }

  if (normalizedMessage === "取消") {
    await rejectRequest({
      id: pendingApproval.id,
      userId: input.userId,
      chatId: input.chatId
    });
    return "已取消这次操作。";
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

  return formatApprovalExecutionReply(result);
}

export async function handleUserTextMessage(
  input: HandleUserTextMessageInput
): Promise<HandleUserTextMessageResult> {
  const startedAt = Date.now();

  try {
    const approvalOutput = await handleApprovalDecision({
      message: input.input,
      userId: input.userId,
      chatId: input.chatId
    });

    if (approvalOutput !== null) {
      const output = sanitizeTelegramText(approvalOutput);
      const latencyMs = Date.now() - startedAt;

      await recordRunSafely({
        userId: input.userId,
        chatId: input.chatId,
        message: input.input,
        output,
        status: "succeeded",
        latencyMs,
        error: null,
        metadata: input.metadata
      });

      return {
        output
      };
    }

    if (isDailyBriefTrigger(input.input)) {
      const result = await runDailyBriefWorkflow({
        userId: input.userId,
        chatId: input.chatId,
        triggerMessage: input.input
      });
      const output = sanitizeTelegramText(result.output);
      const latencyMs = Date.now() - startedAt;

      await recordRunSafely({
        userId: input.userId,
        chatId: input.chatId,
        message: input.input,
        output,
        status: "succeeded",
        latencyMs,
        error: null,
        metadata: {
          ...input.metadata,
          workflow_id: result.workflowId
        }
      });

      return {
        output
      };
    }

    const generatedOutput = await generateReply({
      input: input.input,
      userId: input.userId,
      chatId: input.chatId
    });
    const output = sanitizeTelegramText(generatedOutput);
    const latencyMs = Date.now() - startedAt;

    await recordRunSafely({
      userId: input.userId,
      chatId: input.chatId,
      message: input.input,
      output,
      status: "succeeded",
      latencyMs,
      error: null,
      metadata: input.metadata
    });

    return {
      output
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = toErrorMessage(error);
    const output = sanitizeTelegramText(friendlyErrorMessage);

    console.error("Message handling failed:", error);
    await recordRunSafely({
      userId: input.userId,
      chatId: input.chatId,
      message: input.input,
      output: null,
      status: "failed",
      latencyMs,
      error: errorMessage,
      metadata:
        error instanceof DailyBriefWorkflowError
          ? {
              ...input.metadata,
              workflow_id: error.workflowId
            }
          : input.metadata
    });

    return {
      output
    };
  }
}
