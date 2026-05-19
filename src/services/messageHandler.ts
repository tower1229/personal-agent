import { generateReply } from "../agent/index.js";
import {
  approveRequest,
  expireOldApprovals,
  getLatestApprovalForUser,
  getLatestPendingApprovalForUser,
  markApprovalExecuted,
  rejectRequest
} from "../db/approvals.js";
import {
  createRunningRun,
  markRunFailed,
  markRunSucceeded
} from "../db/runs.js";
import { executeRegisteredTool } from "../tools/registry.js";
import { sanitizeTelegramText } from "../utils/sanitizeTelegramText.js";
import { emitProgress, type ProgressHandler } from "./progress.js";
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
  onProgress?: ProgressHandler;
}

export interface HandleUserTextMessageResult {
  output: string;
  runId: number;
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

function formatApprovalExecutionReply(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "deletedMemories" in result &&
    Array.isArray(result.deletedMemories) &&
    result.deletedMemories.length > 0
  ) {
    return `已删除记忆：${result.deletedMemories
      .map((memory) =>
        memory && typeof memory === "object" && "content" in memory
          ? String(memory.content)
          : ""
      )
      .filter(Boolean)
      .join("；")}`;
  }

  return "已执行确认的操作。";
}

function parseApprovalDecision(message: string):
  | { type: "approve"; code: string | null }
  | { type: "reject" }
  | null {
  const trimmed = message.trim();

  if (trimmed === "取消") {
    return { type: "reject" };
  }

  const match = /^确认(?:\s+(\S+))?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  return {
    type: "approve",
    code: match[1] ?? null
  };
}

async function handleApprovalDecision(input: {
  message: string;
  userId: string;
  chatId: string;
  runId: number;
  onProgress?: ProgressHandler;
}): Promise<string | null> {
  const decision = parseApprovalDecision(input.message);

  if (!decision) {
    return null;
  }

  await emitProgress(input.onProgress, {
    type: "status",
    message: "正在处理确认回复"
  });

  await expireOldApprovals();

  const latestApproval = await getLatestApprovalForUser({
    userId: input.userId,
    chatId: input.chatId
  });

  if (latestApproval?.status === "expired") {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "待确认操作已过期"
    });
    return "待确认操作已过期，请重新发起。";
  }

  if (latestApproval?.status !== "pending") {
    return "当前没有待确认的操作。";
  }

  const pendingApproval = await getLatestPendingApprovalForUser({
    userId: input.userId,
    chatId: input.chatId
  });

  if (!pendingApproval || pendingApproval.id !== latestApproval.id) {
    return "当前没有待确认的操作。";
  }

  if (decision.type === "reject") {
    await rejectRequest({
      id: pendingApproval.id,
      userId: input.userId,
      chatId: input.chatId
    });
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "已取消待确认操作"
    });
    return "已取消这次操作。";
  }

  if (pendingApproval.approvalCode && !decision.code) {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "需要确认码"
    });
    return "这次操作需要确认码。请回复：确认 <确认码>。回复 取消 可放弃。";
  }

  if (
    pendingApproval.approvalCode &&
    decision.code !== pendingApproval.approvalCode
  ) {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "确认码不正确"
    });
    return "确认码不正确，操作未执行。请核对后回复：确认 <确认码>，或回复 取消。";
  }

  const approved = await approveRequest({
    id: pendingApproval.id,
    userId: input.userId,
    chatId: input.chatId
  });
  let executedToolCallId: number | null = null;

  await emitProgress(input.onProgress, {
    type: "tool_start",
    message: `调用工具：${approved.toolName}`,
    toolName: approved.toolName
  });

  let result: unknown;

  try {
    result = await executeRegisteredTool({
      toolName: approved.toolName,
      argsJson: approved.toolArgsJson,
      context: {
        userId: input.userId,
        chatId: input.chatId,
        runId: input.runId
      },
      allowHighRiskExecution: true,
      onToolCallCreated(toolCallId) {
        executedToolCallId = toolCallId;
      }
    });
    await emitProgress(input.onProgress, {
      type: "tool_done",
      message: `工具完成：${approved.toolName}`,
      toolName: approved.toolName,
      outcome: "succeeded"
    });
  } catch (error) {
    await emitProgress(input.onProgress, {
      type: "tool_done",
      message: `工具失败：${approved.toolName}`,
      toolName: approved.toolName,
      outcome: "failed"
    });
    throw error;
  }

  await markApprovalExecuted({
    id: approved.id,
    userId: input.userId,
    chatId: input.chatId,
    executedToolCallId
  });

  return formatApprovalExecutionReply(result);
}

export async function handleUserTextMessage(
  input: HandleUserTextMessageInput
): Promise<HandleUserTextMessageResult> {
  const startedAt = Date.now();
  const initialMetadata = input.metadata;
  const run = await createRunningRun({
    userId: input.userId,
    chatId: input.chatId,
    model: env.OPENAI_MODEL,
    input: input.input,
    metadata: initialMetadata,
    createdAt: new Date(startedAt)
  });
  await emitProgress(input.onProgress, {
    type: "status",
    message: "已创建运行记录"
  });

  try {
    const approvalOutput = await handleApprovalDecision({
      message: input.input,
      userId: input.userId,
      chatId: input.chatId,
      runId: run.id,
      onProgress: input.onProgress
    });

    if (approvalOutput !== null) {
      const output = sanitizeTelegramText(approvalOutput);
      const latencyMs = Date.now() - startedAt;

      await emitProgress(input.onProgress, {
        type: "finalizing",
        message: "正在生成最终回复"
      });
      await markRunSucceeded({
        id: run.id,
        output,
        latencyMs
      });

      return {
        output,
        runId: run.id
      };
    }

    if (isDailyBriefTrigger(input.input)) {
      const result = await runDailyBriefWorkflow({
        userId: input.userId,
        chatId: input.chatId,
        triggerMessage: input.input,
        runId: run.id,
        onProgress: input.onProgress
      });
      const output = sanitizeTelegramText(result.output);
      const latencyMs = Date.now() - startedAt;
      const metadata = {
        ...initialMetadata,
        workflow_id: result.workflowId
      };

      await emitProgress(input.onProgress, {
        type: "finalizing",
        message: "正在生成最终回复"
      });
      await markRunSucceeded({
        id: run.id,
        output,
        latencyMs,
        metadata
      });

      return {
        output,
        runId: run.id
      };
    }

    await emitProgress(input.onProgress, {
      type: "status",
      message: "正在分析请求"
    });
    const generatedOutput = await generateReply({
      input: input.input,
      userId: input.userId,
      chatId: input.chatId,
      runId: run.id,
      onProgress: input.onProgress
    });
    await emitProgress(input.onProgress, {
      type: "finalizing",
      message: "正在生成最终回复"
    });
    const output = sanitizeTelegramText(generatedOutput);
    const latencyMs = Date.now() - startedAt;

    await markRunSucceeded({
      id: run.id,
      output,
      latencyMs
    });

    return {
      output,
      runId: run.id
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = toErrorMessage(error);
    const output = sanitizeTelegramText(friendlyErrorMessage);

    console.error("Message handling failed:", error);
    await markRunFailed({
      id: run.id,
      error: errorMessage,
      latencyMs,
      output: null,
      metadata:
        error instanceof DailyBriefWorkflowError
          ? {
              ...initialMetadata,
              workflow_id: error.workflowId
            }
          : initialMetadata
    });

    return {
      output,
      runId: run.id
    };
  }
}
