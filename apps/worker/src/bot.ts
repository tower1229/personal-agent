import {
  builtInToolNames,
  type SkillManifest,
  type SkillRouteTriggerType,
  type ToolRiskLevel
} from "@personal-agent/shared";
import {
  executeLlmAgent,
  type AgentRuntime,
  type AgentToolResult
} from "./agent.js";
import { type SearchClient, type UrlFetcher } from "./externalTools.js";
import { type LlmClient } from "./llm.js";
import {
  canCancelLongTask,
  canPauseLongTask,
  canResumeLongTask,
  classifyTaskComplexityWithLlm,
  executeLongTaskForRecord,
  formatCompletedLongTask,
  formatLongTaskStatus,
  startLongTask
} from "./longTasks.js";
import { type AgentRepositories } from "./repositories.js";
import {
  getTelegramChatId,
  getTelegramMessageText,
  type TelegramClient
} from "./telegram.js";
import { type TelegramWebhookUpdate } from "@personal-agent/shared";
import { type RunnableSkillRecord } from "./repositories.js";

export interface BotRuntime extends AgentRuntime {
  repositories: AgentRepositories;
  telegramClient: TelegramClient;
  llmClient?: LlmClient;
  searchClient?: SearchClient;
  urlFetcher?: UrlFetcher;
  maxToolRounds: number;
  now: () => number;
  generateId: () => string;
  generateApprovalCode: () => string;
}

interface HandleOwnerUpdateInput {
  update: TelegramWebhookUpdate;
  ownerTgUserId: number;
  runtime: BotRuntime;
}

export interface CommandContext {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
  allowedTools?: Set<string>;
  fallbackResponse?: string;
  fallbackToolName?: string;
}

export interface CommandResult {
  responseText: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  input: unknown;
  output: unknown;
}

function agentResultToCommandResult(result: AgentToolResult): CommandResult {
  return result;
}

export interface SkillMatch {
  runnable: RunnableSkillRecord;
  inputText: string;
  triggerType: SkillRouteTriggerType;
  reason: string;
}

const CREATE_TODO_PATTERN = /^(新增待办|创建待办)[:：]\s*(.+)$/u;
const COMPLETE_TODO_PATTERN = /^完成待办\s+(\d+)$/u;
const REMEMBER_PATTERN = /^记住[:：]\s*(.+)$/u;
const SEARCH_MEMORY_PATTERN = /^(搜索记忆|你记得)\s*(.+)$/u;
const DELETE_MEMORY_PATTERN = /^删除记忆\s+(\d+)$/u;
const APPROVAL_PATTERN = /^(确认)\s+([A-Za-z0-9-]+)$|^(取消)\s+(\d{6})$/u;
const EXPLICIT_SKILL_PATTERN = /^\/skill\s+([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/u;
const LONG_TASK_CONTROL_PATTERN = /^(状态|暂停|继续|取消)(?:\s+([A-Za-z0-9_-]+))?$/u;
const APPROVAL_CODE_ATTEMPTS = 3;

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

function isToolAllowed(context: CommandContext, toolName: string): boolean {
  return !context.allowedTools || context.allowedTools.has(toolName);
}

function blockedToolResult(toolName: string): CommandResult {
  return {
    responseText: `这个 skill 不允许使用工具 ${toolName}。`,
    toolName: "skill_tool_blocked",
    riskLevel: "read",
    input: { requestedTool: toolName },
    output: { blocked: true }
  };
}

async function resolveLongTask(context: CommandContext, id?: string) {
  return id
    ? context.runtime.repositories.getLongTask({
        ownerTgUserId: context.ownerTgUserId,
        id
      })
    : context.runtime.repositories.getLatestActiveLongTask(context.ownerTgUserId);
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

async function recordFailedToolCall(
  context: CommandContext,
  error: string
): Promise<void> {
  await context.runtime.repositories.recordToolCall({
    id: context.runtime.generateId(),
    runId: context.runId,
    ownerTgUserId: context.ownerTgUserId,
    toolName: "command_execution",
    riskLevel: "read",
    status: "failed",
    inputJson: JSON.stringify({ text: context.text }),
    outputJson: null,
    error,
    createdAt: context.runtime.now()
  });
}

async function createApprovalWithRetry(
  context: CommandContext,
  input: {
    action: string;
    payloadJson: string;
  }
) {
  for (let attempt = 0; attempt < APPROVAL_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await context.runtime.repositories.createApproval({
        id: context.runtime.generateId(),
        ownerTgUserId: context.ownerTgUserId,
        action: input.action,
        payloadJson: input.payloadJson,
        status: "pending",
        code: context.runtime.generateApprovalCode(),
        createdAt: context.runtime.now(),
        decidedAt: null
      });
    } catch (error) {
      if (attempt === APPROVAL_CODE_ATTEMPTS - 1) {
        return null;
      }
    }
  }

  return null;
}

export async function executeCommand(
  context: CommandContext
): Promise<CommandResult> {
  const text = context.text.trim();
  const repositories = context.runtime.repositories;

  if (text === "/start") {
    return {
      responseText:
        "Cloudflare Bot 已接入。当前支持待办、记忆、删除确认、skill、schedule、LLM 和联网搜索。",
      toolName: "bot_status",
      riskLevel: "read",
      input: { text },
      output: { status: "ready" }
    };
  }

  const createTodo = CREATE_TODO_PATTERN.exec(text);
  if (createTodo) {
    if (!isToolAllowed(context, "create_todo")) {
      return blockedToolResult("create_todo");
    }

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
    if (!isToolAllowed(context, "list_todos")) {
      return blockedToolResult("list_todos");
    }

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
    if (!isToolAllowed(context, "complete_todo")) {
      return blockedToolResult("complete_todo");
    }

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
    if (!isToolAllowed(context, "save_memory")) {
      return blockedToolResult("save_memory");
    }

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
    if (!isToolAllowed(context, "search_memory")) {
      return blockedToolResult("search_memory");
    }

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
    if (!isToolAllowed(context, "delete_memory_request")) {
      return blockedToolResult("delete_memory_request");
    }

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

    const approval = await createApprovalWithRetry(context, {
      action: "delete_memory",
      payloadJson: JSON.stringify({ memoryId: id })
    });

    if (!approval) {
      return {
        responseText: "创建删除确认码失败，请稍后重试。",
        toolName: "delete_memory_request",
        riskLevel: "destructive",
        input: { id },
        output: { approvalCreated: false }
      };
    }

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
    const decision = approvalDecision[1] ?? approvalDecision[3];
    const code = approvalDecision[2] ?? approvalDecision[4] ?? "";
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

  const longTaskControl = LONG_TASK_CONTROL_PATTERN.exec(text);
  if (longTaskControl) {
    const action = longTaskControl[1] ?? "";
    const id = longTaskControl[2];
    const task = await resolveLongTask(context, id);
    if (!task) {
      return {
        responseText: id
          ? `没有找到长任务 ${id}。`
          : "没有找到未完成的长任务。",
        toolName: "long_task_control",
        riskLevel: "read",
        input: { action, id },
        output: { found: false }
      };
    }

    if (action === "状态") {
      const steps = await repositories.listLongTaskSteps(task.id);
      return {
        responseText: formatLongTaskStatus({ task, steps }),
        toolName: "long_task_status",
        riskLevel: "read",
        input: { action, id: task.id },
        output: { taskId: task.id, status: task.status }
      };
    }

    if (action === "暂停") {
      if (!canPauseLongTask(task)) {
        return {
          responseText: `长任务 ${task.id} 当前状态为 ${task.status}，不能暂停。`,
          toolName: "long_task_pause",
          riskLevel: "read",
          input: { action, id: task.id },
          output: { taskId: task.id, status: task.status, updated: false }
        };
      }
      await repositories.updateLongTask({
        id: task.id,
        status: "paused",
        currentStepId: task.currentStepId,
        outputText: task.outputText,
        error: task.error,
        updatedAt: context.runtime.now()
      });
      await repositories.createLongTaskEvent({
        id: context.runtime.generateId(),
        longTaskId: task.id,
        ownerTgUserId: context.ownerTgUserId,
        stepId: null,
        eventType: "paused",
        payloadJson: JSON.stringify({ source: "telegram" }),
        createdAt: context.runtime.now()
      });
      return {
        responseText: `已暂停长任务 ${task.id}。`,
        toolName: "long_task_pause",
        riskLevel: "write_low",
        input: { action, id: task.id },
        output: { taskId: task.id }
      };
    }

    if (action === "取消") {
      if (!canCancelLongTask(task)) {
        return {
          responseText: `长任务 ${task.id} 当前状态为 ${task.status}，不能取消。`,
          toolName: "long_task_cancel",
          riskLevel: "read",
          input: { action, id: task.id },
          output: { taskId: task.id, status: task.status, updated: false }
        };
      }
      await repositories.updateLongTask({
        id: task.id,
        status: "cancelled",
        currentStepId: task.currentStepId,
        outputText: task.outputText,
        error: "用户取消",
        updatedAt: context.runtime.now()
      });
      await repositories.createLongTaskEvent({
        id: context.runtime.generateId(),
        longTaskId: task.id,
        ownerTgUserId: context.ownerTgUserId,
        stepId: null,
        eventType: "cancelled",
        payloadJson: JSON.stringify({ source: "telegram" }),
        createdAt: context.runtime.now()
      });
      return {
        responseText: `已取消长任务 ${task.id}。`,
        toolName: "long_task_cancel",
        riskLevel: "write_low",
        input: { action, id: task.id },
        output: { taskId: task.id }
      };
    }

    if (!canResumeLongTask(task)) {
      return {
        responseText: `长任务 ${task.id} 当前状态为 ${task.status}，不能继续。`,
        toolName: "long_task_resume",
        riskLevel: "read",
        input: { action, id: task.id },
        output: { taskId: task.id, status: task.status, updated: false }
      };
    }
    const steps = await repositories.listLongTaskSteps(task.id);
    const blocked = steps.find((step) => step.status === "blocked");
    if (blocked) {
      await repositories.updateLongTaskStep({
        id: blocked.id,
        status: "skipped",
        outputJson: JSON.stringify({ skippedByUserConfirmation: true }),
        error: null,
        completedAt: context.runtime.now()
      });
    }
    const runningTask = {
      ...task,
      status: "running" as const,
      error: null,
      updatedAt: context.runtime.now()
    };
    await repositories.updateLongTask({
      id: task.id,
      status: "running",
      currentStepId: task.currentStepId,
      outputText: task.outputText,
      error: null,
      updatedAt: context.runtime.now()
    });
    await repositories.createLongTaskEvent({
      id: context.runtime.generateId(),
      longTaskId: task.id,
      ownerTgUserId: context.ownerTgUserId,
      stepId: blocked?.id ?? null,
      eventType: "resumed",
      payloadJson: JSON.stringify({ source: "telegram" }),
      createdAt: context.runtime.now()
    });
    await executeLongTaskForRecord({
      runtime: context.runtime,
      task: runningTask
    });
    const updated = await repositories.getLongTask({
      ownerTgUserId: context.ownerTgUserId,
      id: task.id
    });
    return {
      responseText: updated
        ? updated.status === "succeeded" && updated.outputText
          ? formatCompletedLongTask(updated, updated.outputText)
          : formatLongTaskStatus({
              task: updated,
              steps: await repositories.listLongTaskSteps(updated.id)
            })
        : `已继续长任务 ${task.id}。`,
      toolName: "long_task_resume",
      riskLevel: "write_low",
      input: { action, id: task.id },
      output: { taskId: task.id }
    };
  }

  return {
    responseText:
      context.fallbackResponse ??
      "Cloudflare 核心 Bot 已接入，LLM/skill 将在后续阶段开启。",
    toolName: context.fallbackToolName ?? "fallback",
    riskLevel: "read",
    input: { text },
    output: { handled: false }
  };
}

function buildSkillFallback(
  manifest: SkillManifest,
  inputText: string
): string {
  return [
    `【${manifest.name}】`,
    manifest.instructions,
    "",
    inputText ? `输入：${inputText}` : "已触发该 skill。"
  ].join("\n");
}

async function findSkillMatch(input: {
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
}): Promise<SkillMatch | null> {
  const explicit = EXPLICIT_SKILL_PATTERN.exec(input.text.trim());

  if (explicit) {
    const skillId = explicit[1] ?? "";
    const runnable = await input.runtime.repositories.getRunnableSkillById({
      ownerTgUserId: input.ownerTgUserId,
      id: skillId
    });

    if (!runnable) {
      return null;
    }

    return {
      runnable,
      inputText: (explicit[2] ?? "").trim(),
      triggerType: "explicit_id",
      reason: `explicit skill id ${skillId}`
    };
  }

  const runnableSkills = await input.runtime.repositories.listRunnableSkills(
    input.ownerTgUserId
  );
  const text = input.text.trim();

  for (const runnable of runnableSkills) {
    for (const phrase of runnable.version.manifest.triggerPhrases) {
      const trigger = phrase.trim();
      if (!trigger) {
        continue;
      }

      if (text === trigger) {
        return {
          runnable,
          inputText: "",
          triggerType: "trigger_phrase",
          reason: `exact trigger phrase ${trigger}`
        };
      }

      for (const separator of [" ", "：", ":"]) {
        const prefix = `${trigger}${separator}`;
        if (text.startsWith(prefix)) {
          return {
            runnable,
            inputText: text.slice(prefix.length).trim(),
            triggerType: "trigger_phrase",
            reason: `prefix trigger phrase ${trigger}`
          };
        }
      }
    }
  }

  return null;
}

async function recordRouteDecision(input: {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
  match: SkillMatch | null;
}): Promise<void> {
  await input.runtime.repositories.createSkillRouteDecision({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    inputText: input.text,
    triggerType: input.match?.triggerType ?? "none",
    matchedSkillId: input.match?.runnable.skill.id ?? null,
    matchedSkillVersionId: input.match?.runnable.version.id ?? null,
    confidence: input.match ? 1 : null,
    reason: input.match?.reason ?? "no explicit skill matched",
    createdAt: input.runtime.now()
  });
}

export async function executeSkill(input: {
  runId: string;
  ownerTgUserId: number;
  match: SkillMatch;
  runtime: BotRuntime;
}): Promise<CommandResult & { skillRunId: string }> {
  const manifest = input.match.runnable.version.manifest;
  const skillRun = await input.runtime.repositories.createSkillRun({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    skillId: input.match.runnable.skill.id,
    skillVersionId: input.match.runnable.version.id,
    status: "running",
    inputText: input.match.inputText,
    outputText: null,
    error: null,
    createdAt: input.runtime.now(),
    updatedAt: input.runtime.now()
  });
  const allowedTools = new Set(
    manifest.allowedTools.filter((tool) =>
      builtInToolNames.includes(tool as (typeof builtInToolNames)[number])
    )
  );

  try {
    const result = agentResultToCommandResult(
      await executeLlmAgent({
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        inputText: input.match.inputText,
        runtime: input.runtime,
        allowedTools,
        systemInstructions: buildSkillFallback(manifest, input.match.inputText),
        maxToolRounds: input.runtime.maxToolRounds
      })
    );

    await input.runtime.repositories.updateSkillRun({
      id: skillRun.id,
      status: "succeeded",
      outputText: result.responseText,
      error: null,
      updatedAt: input.runtime.now()
    });

    return {
      ...result,
      skillRunId: skillRun.id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Skill run failed";
    await input.runtime.repositories.updateSkillRun({
      id: skillRun.id,
      status: "failed",
      outputText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
    throw error;
  }
}

async function executeCommandOrLlmFallback(input: {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
}): Promise<CommandResult> {
  const commandResult = await executeCommand({
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    text: input.text,
    runtime: input.runtime
  });

  if (commandResult.toolName !== "fallback") {
    return commandResult;
  }

  const decision = await classifyTaskComplexityWithLlm({
    text: input.text,
    runtime: input.runtime
  });
  if (decision.mode === "long_task") {
    const started = await startLongTask({
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      text: input.text,
      decision,
      runtime: input.runtime
    });
    return {
      responseText: started.responseText,
      toolName: "long_task_start",
      riskLevel: "external_send",
      input: { text: input.text },
      output: { taskId: started.task.id }
    };
  }

  return agentResultToCommandResult(
    await executeLlmAgent({
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      inputText: input.text,
      runtime: input.runtime,
      maxToolRounds: input.runtime.maxToolRounds
    })
  );
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
    const match = await findSkillMatch({
      ownerTgUserId: input.ownerTgUserId,
      text: text ?? "",
      runtime: input.runtime
    });
    await recordRouteDecision({
      runId: run.id,
      ownerTgUserId: input.ownerTgUserId,
      text: text ?? "",
      runtime: input.runtime,
      match
    });

    const result = match
      ? await executeSkill({
          runId: run.id,
          ownerTgUserId: input.ownerTgUserId,
          match,
          runtime: input.runtime
        })
      : agentResultToCommandResult(
          await executeCommandOrLlmFallback({
            runId: run.id,
            ownerTgUserId: input.ownerTgUserId,
            text: text ?? "",
            runtime: input.runtime
          })
        );

    if (
      !match && result.toolName !== "llm_agent"
    ) {
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
    }

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
    await recordFailedToolCall(
      {
        runId: run.id,
        ownerTgUserId: input.ownerTgUserId,
        text: text ?? "",
        runtime: input.runtime
      },
      error
    );
    await input.runtime.repositories.updateRun(run.id, {
      status: "failed",
      responseText: null,
      error,
      updatedAt: input.runtime.now()
    });
    await input.runtime.telegramClient
      .sendMessage({
        chatId,
        text: `执行失败：${error}`
      })
      .catch(() => undefined);
  }

  return { runId: run.id };
}
