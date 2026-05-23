import { type ToolRiskLevel } from "@personal-agent/shared";
import { type AgentRepositories } from "./repositories.js";
import {
  getTelegramChatId,
  getTelegramMessageText,
  type TelegramClient
} from "./telegram.js";
import { type TelegramWebhookUpdate } from "@personal-agent/shared";

interface BotRuntime {
  repositories: AgentRepositories;
  telegramClient: TelegramClient;
  now: () => number;
  generateId: () => string;
  generateApprovalCode: () => string;
}

interface HandleOwnerUpdateInput {
  update: TelegramWebhookUpdate;
  ownerTgUserId: number;
  runtime: BotRuntime;
}

interface CommandContext {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
}

interface CommandResult {
  responseText: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  input: unknown;
  output: unknown;
}

const CREATE_TODO_PATTERN = /^(新增待办|创建待办)[:：]\s*(.+)$/u;
const COMPLETE_TODO_PATTERN = /^完成待办\s+(\d+)$/u;
const REMEMBER_PATTERN = /^记住[:：]\s*(.+)$/u;
const SEARCH_MEMORY_PATTERN = /^(搜索记忆|你记得)\s*(.+)$/u;
const DELETE_MEMORY_PATTERN = /^删除记忆\s+(\d+)$/u;
const APPROVAL_PATTERN = /^(确认|取消)\s+([A-Za-z0-9-]+)$/u;

export function normalizeMemoryContent(content: string): string {
  return content.trim().toLocaleLowerCase();
}

function trimRequired(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatTodos(
  todos: Array<{ id: number; title: string; status: string }>
): string {
  if (todos.length === 0) {
    return "当前没有未完成待办。";
  }

  return [
    "未完成待办：",
    ...todos.map((todo) => `#${todo.id} ${todo.title}`)
  ].join("\n");
}

function formatMemories(
  memories: Array<{ id: number; content: string }>
): string {
  if (memories.length === 0) {
    return "没有找到相关记忆。";
  }

  return [
    "找到这些记忆：",
    ...memories.map((memory) => `#${memory.id} ${memory.content}`)
  ].join("\n");
}

async function recordToolCall(
  context: CommandContext,
  result: CommandResult,
  status: "succeeded" | "failed",
  error: string | null = null
): Promise<void> {
  await context.runtime.repositories.recordToolCall({
    id: context.runtime.generateId(),
    runId: context.runId,
    ownerTgUserId: context.ownerTgUserId,
    toolName: result.toolName,
    riskLevel: result.riskLevel,
    status,
    inputJson: JSON.stringify(result.input),
    outputJson: status === "succeeded" ? JSON.stringify(result.output) : null,
    error,
    createdAt: context.runtime.now()
  });
}

async function executeCommand(context: CommandContext): Promise<CommandResult> {
  const text = context.text.trim();
  const repositories = context.runtime.repositories;

  if (text === "/start") {
    return {
      responseText:
        "Cloudflare 核心 Bot 已接入。当前支持待办、记忆和删除确认；LLM/skill 会在后续阶段开启。",
      toolName: "bot_status",
      riskLevel: "read",
      input: { text },
      output: { status: "ready" }
    };
  }

  const createTodo = CREATE_TODO_PATTERN.exec(text);
  if (createTodo) {
    const title = trimRequired(createTodo[2] ?? "");
    if (!title) {
      return {
        responseText: "待办内容不能为空。",
        toolName: "create_todo",
        riskLevel: "write_low",
        input: { text },
        output: { created: false }
      };
    }

    const todo = await repositories.createTodo({
      ownerTgUserId: context.ownerTgUserId,
      title,
      createdAt: context.runtime.now()
    });

    return {
      responseText: `已创建待办 #${todo.id}：${todo.title}`,
      toolName: "create_todo",
      riskLevel: "write_low",
      input: { title },
      output: { id: todo.id, title: todo.title }
    };
  }

  if (text === "列出我的待办") {
    const todos = await repositories.listOpenTodos(context.ownerTgUserId, 20);

    return {
      responseText: formatTodos(todos),
      toolName: "list_todos",
      riskLevel: "read",
      input: { status: "open" },
      output: { count: todos.length }
    };
  }

  const completeTodo = COMPLETE_TODO_PATTERN.exec(text);
  if (completeTodo) {
    const id = Number.parseInt(completeTodo[1] ?? "", 10);
    const todo = await repositories.completeTodo({
      ownerTgUserId: context.ownerTgUserId,
      id,
      completedAt: context.runtime.now()
    });

    return {
      responseText: todo
        ? `已完成待办 #${todo.id}：${todo.title}`
        : `没有找到未完成待办 #${id}。`,
      toolName: "complete_todo",
      riskLevel: "write_low",
      input: { id },
      output: { completed: Boolean(todo) }
    };
  }

  const remember = REMEMBER_PATTERN.exec(text);
  if (remember) {
    const content = trimRequired(remember[1] ?? "");
    if (!content) {
      return {
        responseText: "记忆内容不能为空。",
        toolName: "save_memory",
        riskLevel: "write_low",
        input: { text },
        output: { saved: false }
      };
    }

    const createdAt = context.runtime.now();
    const memory = await repositories.createMemory({
      ownerTgUserId: context.ownerTgUserId,
      content,
      normalizedContent: normalizeMemoryContent(content),
      createdAt
    });
    await repositories.recordMemoryEvent({
      memoryId: memory.id,
      ownerTgUserId: context.ownerTgUserId,
      eventType: "created",
      payload: { source: "telegram" },
      createdAt
    });

    return {
      responseText: `已保存记忆 #${memory.id}。`,
      toolName: "save_memory",
      riskLevel: "write_low",
      input: { content },
      output: { id: memory.id }
    };
  }

  const searchMemory = SEARCH_MEMORY_PATTERN.exec(text);
  if (searchMemory) {
    const keyword = trimRequired(searchMemory[2] ?? "");
    if (!keyword) {
      return {
        responseText: "搜索关键词不能为空。",
        toolName: "search_memory",
        riskLevel: "read",
        input: { text },
        output: { count: 0 }
      };
    }

    const memories = await repositories.searchMemories({
      ownerTgUserId: context.ownerTgUserId,
      keyword: normalizeMemoryContent(keyword),
      limit: 5
    });

    return {
      responseText: formatMemories(memories),
      toolName: "search_memory",
      riskLevel: "read",
      input: { keyword },
      output: { count: memories.length }
    };
  }

  const deleteMemory = DELETE_MEMORY_PATTERN.exec(text);
  if (deleteMemory) {
    const id = Number.parseInt(deleteMemory[1] ?? "", 10);
    const memory = await repositories.getActiveMemory({
      ownerTgUserId: context.ownerTgUserId,
      id
    });

    if (!memory) {
      return {
        responseText: `没有找到可删除的记忆 #${id}。`,
        toolName: "delete_memory_request",
        riskLevel: "destructive",
        input: { id },
        output: { approvalCreated: false }
      };
    }

    const approval = await repositories.createApproval({
      id: context.runtime.generateId(),
      ownerTgUserId: context.ownerTgUserId,
      action: "delete_memory",
      payloadJson: JSON.stringify({ memoryId: id }),
      status: "pending",
      code: context.runtime.generateApprovalCode(),
      createdAt: context.runtime.now(),
      decidedAt: null
    });

    return {
      responseText: `删除记忆 #${id} 需要确认。发送：确认 ${approval.code}`,
      toolName: "delete_memory_request",
      riskLevel: "destructive",
      input: { id },
      output: { approvalId: approval.id, code: approval.code }
    };
  }

  const approvalDecision = APPROVAL_PATTERN.exec(text);
  if (approvalDecision) {
    const decision = approvalDecision[1];
    const code = approvalDecision[2] ?? "";
    const approval = await repositories.findPendingApprovalByCode({
      ownerTgUserId: context.ownerTgUserId,
      code
    });

    if (!approval) {
      return {
        responseText: `没有找到待处理确认码 ${code}。`,
        toolName: "approval_decision",
        riskLevel: "destructive",
        input: { code, decision },
        output: { found: false }
      };
    }

    const decidedAt = context.runtime.now();
    if (decision === "取消") {
      await repositories.updateApprovalStatus({
        id: approval.id,
        status: "rejected",
        decidedAt
      });

      return {
        responseText: `已取消确认码 ${code}。`,
        toolName: "approval_decision",
        riskLevel: "destructive",
        input: { code, decision },
        output: { status: "rejected" }
      };
    }

    if (approval.action !== "delete_memory") {
      await repositories.updateApprovalStatus({
        id: approval.id,
        status: "execution_failed",
        decidedAt
      });
      return {
        responseText: `确认码 ${code} 对应的操作暂不支持执行。`,
        toolName: "approval_decision",
        riskLevel: "destructive",
        input: { code, decision, action: approval.action },
        output: { status: "execution_failed" }
      };
    }

    const payload = JSON.parse(approval.payloadJson) as { memoryId?: unknown };
    const memoryId =
      typeof payload.memoryId === "number" ? payload.memoryId : null;
    const deleted =
      memoryId === null
        ? null
        : await repositories.markMemoryDeleted({
            ownerTgUserId: context.ownerTgUserId,
            id: memoryId,
            deletedAt: decidedAt
          });

    if (!deleted) {
      await repositories.updateApprovalStatus({
        id: approval.id,
        status: "execution_failed",
        decidedAt
      });
      return {
        responseText: `确认码 ${code} 执行失败，目标记忆不存在或已删除。`,
        toolName: "approval_decision",
        riskLevel: "destructive",
        input: { code, decision, memoryId },
        output: { status: "execution_failed" }
      };
    }

    await repositories.recordMemoryEvent({
      memoryId: deleted.id,
      ownerTgUserId: context.ownerTgUserId,
      eventType: "deleted",
      payload: { approvalId: approval.id },
      createdAt: decidedAt
    });
    await repositories.updateApprovalStatus({
      id: approval.id,
      status: "executed",
      decidedAt
    });

    return {
      responseText: `已删除记忆 #${deleted.id}。`,
      toolName: "approval_decision",
      riskLevel: "destructive",
      input: { code, decision, memoryId: deleted.id },
      output: { status: "executed" }
    };
  }

  return {
    responseText: "Cloudflare 核心 Bot 已接入，LLM/skill 将在后续阶段开启。",
    toolName: "fallback",
    riskLevel: "read",
    input: { text },
    output: { handled: false }
  };
}

export async function handleOwnerUpdate(
  input: HandleOwnerUpdateInput
): Promise<{ runId: string }> {
  const chatId = getTelegramChatId(input.update);
  const text = getTelegramMessageText(input.update);
  const runId = input.runtime.generateId();
  const now = input.runtime.now();

  if (!chatId) {
    return { runId };
  }

  const run = await input.runtime.repositories.createRun({
    id: runId,
    ownerTgUserId: input.ownerTgUserId,
    chatId,
    updateId: input.update.update_id,
    messageText: text,
    createdAt: now,
    updatedAt: now
  });

  try {
    const result = await executeCommand({
      runId: run.id,
      ownerTgUserId: input.ownerTgUserId,
      text: text ?? "",
      runtime: input.runtime
    });

    await recordToolCall(
      {
        runId: run.id,
        ownerTgUserId: input.ownerTgUserId,
        text: text ?? "",
        runtime: input.runtime
      },
      result,
      "succeeded"
    );

    try {
      await input.runtime.telegramClient.sendMessage({
        chatId,
        text: result.responseText
      });
      await input.runtime.repositories.updateRun(run.id, {
        status: "succeeded",
        responseText: result.responseText,
        error: null,
        updatedAt: input.runtime.now()
      });
    } catch (sendError) {
      await input.runtime.repositories.updateRun(run.id, {
        status: "failed",
        responseText: result.responseText,
        error:
          sendError instanceof Error
            ? sendError.message
            : "Telegram sendMessage failed",
        updatedAt: input.runtime.now()
      });
    }
  } catch (commandError) {
    const error =
      commandError instanceof Error ? commandError.message : "Command failed";
    await input.runtime.repositories.updateRun(run.id, {
      status: "failed",
      responseText: null,
      error,
      updatedAt: input.runtime.now()
    });
  }

  return { runId: run.id };
}
