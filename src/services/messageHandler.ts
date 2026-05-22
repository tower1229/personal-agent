import { generateReply } from "../agent/index.js";
import {
  expireOldApprovals,
  findPendingApprovalByCode,
  getLatestApprovalForUser,
  getLatestApprovalForUserByCode,
  getLatestPendingApprovalForUser,
  markApprovalExecuting,
  markApprovalExecuted,
  markApprovalExecutionFailed,
  rejectRequest
} from "../db/approvals.js";
import { createJob } from "../db/jobs.js";
import {
  createRunningRun,
  getRun,
  markRunFailed,
  markRunSucceeded
} from "../db/runs.js";
import { type Run } from "../db/schema.js";
import { executeRegisteredTool } from "../tools/registry.js";
import { toErrorMessage } from "../utils/errors.js";
import { sanitizeTelegramText } from "../utils/sanitizeTelegramText.js";
import { emitProgress, type ProgressHandler } from "./progress.js";
import {
  DailyBriefWorkflowError,
  runDailyBriefWorkflow
} from "../workflows/dailyBrief.js";
import { env } from "../config/env.js";
import { type LlmClient } from "../llm/types.js";

const friendlyErrorMessage =
  "抱歉，我刚刚处理消息时遇到问题。请稍后再试。";

export interface HandleUserTextMessageInput {
  input: string;
  userId: string;
  chatId: string;
  metadata: Record<string, unknown>;
  onProgress?: ProgressHandler;
  llmClient?: LlmClient;
}

export interface HandleUserTextMessageResult {
  output: string;
  runId: number;
}

export interface EnqueueUserTextMessageResult {
  output: string;
  runId: number;
  jobId: number;
  reusedExistingJob: boolean;
}

function isDailyBriefTrigger(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return (
    normalized === "生成今日简报" ||
    normalized === "今日简报" ||
    normalized === "daily brief"
  );
}

export function formatApprovalExecutionReply(result: unknown): string {
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

export function parseApprovalDecision(message: string):
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

  const pendingApproval = await getLatestPendingApprovalForUser({
    userId: input.userId,
    chatId: input.chatId
  });

  if (!pendingApproval) {
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

  if (!decision.code) {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "需要确认码"
    });
    return "这次操作需要确认码。请回复：确认 <确认码>。回复 取消 可放弃。";
  }

  const latestApprovalForCode = await getLatestApprovalForUserByCode({
    userId: input.userId,
    chatId: input.chatId,
    code: decision.code
  });

  if (latestApprovalForCode?.status === "expired") {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "待确认操作已过期"
    });
    return "待确认操作已过期，请重新发起。";
  }

  if (latestApprovalForCode?.status && latestApprovalForCode.status !== "pending") {
    return "当前没有匹配确认码的待确认操作。";
  }

  const approvalToExecute = await findPendingApprovalByCode({
    userId: input.userId,
    chatId: input.chatId,
    code: decision.code
  });

  if (!approvalToExecute) {
    await emitProgress(input.onProgress, {
      type: "approval_required",
      message: "确认码不正确"
    });
    return "确认码不正确或待确认操作已不可执行。请核对后回复：确认 <确认码>，或回复 取消。";
  }

  const executing = await markApprovalExecuting({
    id: approvalToExecute.id,
    userId: input.userId,
    chatId: input.chatId,
    code: decision.code
  });
  let executedToolCallId: number | null = null;

  await emitProgress(input.onProgress, {
    type: "tool_start",
    message: `调用工具：${executing.toolName}`,
    toolName: executing.toolName
  });

  let result: unknown;

  try {
    result = await executeRegisteredTool({
      toolName: executing.toolName,
      argsJson: executing.toolArgsJson,
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
      message: `工具完成：${executing.toolName}`,
      toolName: executing.toolName,
      outcome: "succeeded"
    });
  } catch (error) {
    await markApprovalExecutionFailed({
      id: executing.id,
      error: toErrorMessage(error)
    });
    await emitProgress(input.onProgress, {
      type: "tool_done",
      message: `工具失败：${executing.toolName}`,
      toolName: executing.toolName,
      outcome: "failed"
    });
    throw error;
  }

  await markApprovalExecuted({
    id: executing.id,
    executedToolCallId
  });

  return formatApprovalExecutionReply(result);
}

async function processRunningTextMessage(input: {
  run: Run;
  input: string;
  userId: string;
  chatId: string;
  metadata: Record<string, unknown>;
  onProgress?: ProgressHandler;
  llmClient?: LlmClient;
  rethrowErrors?: boolean;
}): Promise<HandleUserTextMessageResult> {
  const startedAt = input.run.createdAt.getTime();
  const initialMetadata = input.metadata;

  await emitProgress(input.onProgress, {
    type: "status",
    message: "已创建运行记录"
  });

  try {
    const approvalOutput = await handleApprovalDecision({
      message: input.input,
      userId: input.userId,
      chatId: input.chatId,
      runId: input.run.id,
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
        id: input.run.id,
        output,
        latencyMs
      });

      return {
        output,
        runId: input.run.id
      };
    }

    if (isDailyBriefTrigger(input.input)) {
      const result = await runDailyBriefWorkflow({
        userId: input.userId,
        chatId: input.chatId,
        triggerMessage: input.input,
        runId: input.run.id,
        onProgress: input.onProgress,
        llmClient: input.llmClient
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
        id: input.run.id,
        output,
        latencyMs,
        metadata
      });

      return {
        output,
        runId: input.run.id
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
      runId: input.run.id,
      onProgress: input.onProgress,
      llmClient: input.llmClient
    });
    await emitProgress(input.onProgress, {
      type: "finalizing",
      message: "正在生成最终回复"
    });
    const output = sanitizeTelegramText(generatedOutput);
    const latencyMs = Date.now() - startedAt;

    await markRunSucceeded({
      id: input.run.id,
      output,
      latencyMs
    });

    return {
      output,
      runId: input.run.id
    };
  } catch (error) {
    if (input.rethrowErrors) {
      throw error;
    }

    const latencyMs = Date.now() - startedAt;
    const errorMessage = toErrorMessage(error);
    const output = sanitizeTelegramText(friendlyErrorMessage);

    console.error("Message handling failed:", error);
    await markRunFailed({
      id: input.run.id,
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
      runId: input.run.id
    };
  }
}

export async function processUserTextMessageJob(input: {
  runId: number;
  message: string;
  userId: string;
  chatId: string;
  metadata: Record<string, unknown>;
  onProgress?: ProgressHandler;
  llmClient?: LlmClient;
}): Promise<HandleUserTextMessageResult> {
  const run = await getRun(input.runId);

  if (!run) {
    throw new Error(`Run ${input.runId} was not found`);
  }

  return processRunningTextMessage({
    run,
    input: input.message,
    userId: input.userId,
    chatId: input.chatId,
    metadata: input.metadata,
    onProgress: input.onProgress,
    llmClient: input.llmClient,
    rethrowErrors: true
  });
}

export async function enqueueUserTextMessage(input: HandleUserTextMessageInput & {
  idempotencyKey: string;
  onRunCreated?: (runId: number) => void;
  onRunDiscarded?: (runId: number) => void;
}): Promise<EnqueueUserTextMessageResult> {
  const startedAt = Date.now();
  const run = await createRunningRun({
    userId: input.userId,
    chatId: input.chatId,
    model: env.OPENAI_MODEL,
    input: input.input,
    metadata: input.metadata,
    createdAt: new Date(startedAt)
  });

  input.onRunCreated?.(run.id);

  const job = await createJob({
    type: "handle_text_message",
    userId: input.userId,
    chatId: input.chatId,
    runId: run.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      message: input.input,
      metadata: input.metadata
    }
  });

  if (job.runId && job.runId !== run.id) {
    await markRunFailed({
      id: run.id,
      error: `Duplicate idempotency key: ${input.idempotencyKey}`,
      latencyMs: Date.now() - startedAt,
      output: null,
      metadata: input.metadata
    });
    input.onRunDiscarded?.(run.id);

    return {
      output: "已收到，正在处理。",
      runId: job.runId,
      jobId: job.id,
      reusedExistingJob: true
    };
  }

  await emitProgress(input.onProgress, {
    type: "status",
    message: "已收到，正在处理"
  });

  return {
    output: "已收到，正在处理。",
    runId: run.id,
    jobId: job.id,
    reusedExistingJob: false
  };
}

export async function handleUserTextMessage(
  input: HandleUserTextMessageInput
): Promise<HandleUserTextMessageResult> {
  const startedAt = Date.now();
  const run = await createRunningRun({
    userId: input.userId,
    chatId: input.chatId,
    model: env.OPENAI_MODEL,
    input: input.input,
    metadata: input.metadata,
    createdAt: new Date(startedAt)
  });

  return processRunningTextMessage({
    run,
    input: input.input,
    userId: input.userId,
    chatId: input.chatId,
    metadata: input.metadata,
    onProgress: input.onProgress,
    llmClient: input.llmClient
  });
}
