import {
  personalModelLayers,
  personalModelScenarios,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type SkillRouteTriggerType,
  type ToolRiskLevel,
  ROUTING_CONFIDENCE_AUTO_RUN_THRESHOLD,
  ROUTING_CONFIDENCE_CONFIRM_THRESHOLD
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
  startLongTask,
  syncLongTaskMessage
} from "./longTasks.js";
import { type AgentRepositories } from "./repositories.js";
import {
  getTelegramChatId,
  getTelegramMessageText,
  type TelegramClient
} from "./telegram.js";
import { type TelegramWebhookUpdate } from "@personal-agent/shared";
import { type RunnableSkillRecord } from "./repositories.js";
import { allowedBuiltInToolsForSkill } from "./skillPackages.js";

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
  contextTraceJson?: string;
}

function agentResultToCommandResult(result: AgentToolResult): CommandResult {
  return result;
}

function contextTraceJsonFromError(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const trace = (error as { contextTraceJson?: unknown }).contextTraceJson;
  return typeof trace === "string" ? trace : undefined;
}

export interface SkillMatch {
  runnable: RunnableSkillRecord;
  inputText: string;
  triggerType: SkillRouteTriggerType;
  confidence: number;
  reason: string;
  candidatesJson: string;
}

const CREATE_TODO_PATTERN = /^(新增待办|创建待办)[:：]\s*(.+)$/u;
const COMPLETE_TODO_PATTERN = /^完成待办\s+(\d+)$/u;
const REMEMBER_PATTERN = /^记住[:：]\s*(.+)$/u;
const RECORD_UNDERSTANDING_PATTERN = /^记录理解[:：]\s*(.+)$/u;
const RECORD_GAP_PATTERN = /^记录缺口[:：]\s*(.+)$/u;
const CORRECT_UNDERSTANDING_PATTERN = /^修正理解[:：]\s*(.+)$/u;
const SEARCH_MEMORY_PATTERN = /^(搜索记忆|你记得)\s*(.+)$/u;
const DELETE_MEMORY_PATTERN = /^删除记忆\s+(\d+)$/u;
const APPROVAL_PATTERN = /^(确认)\s+([A-Za-z0-9-]+)$|^(取消)\s+(\d{6})$/u;
const EXPLICIT_SKILL_PATTERN = /^\/skill\s+([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/u;

const APPROVAL_CODE_ATTEMPTS = 3;

export function normalizeMemoryContent(content: string): string {
  return content.trim().toLocaleLowerCase();
}

function trimRequired(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePersonalModelClaimInput(input: string): {
  claim: string;
  layer: PersonalModelLayer;
  scenario: PersonalModelScenario;
} | null {
  const text = input.trim();
  if (!text) {
    return null;
  }

  const match = /^\[([^/\]]+)\/([^/\]]+)\]\s*([\s\S]+)$/u.exec(text);
  if (!match) {
    return {
      claim: text,
      layer: "preference",
      scenario: "global"
    };
  }

  const layer = match[1] as PersonalModelLayer;
  const scenario = match[2] as PersonalModelScenario;
  const claim = trimRequired(match[3] ?? "");
  if (
    !claim ||
    !personalModelLayers.includes(layer) ||
    !personalModelScenarios.includes(scenario)
  ) {
    return null;
  }

  return { claim, layer, scenario };
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

  const recordUnderstanding = RECORD_UNDERSTANDING_PATTERN.exec(text);
  if (recordUnderstanding) {
    const parsedClaim = parsePersonalModelClaimInput(
      recordUnderstanding[1] ?? ""
    );
    if (!parsedClaim) {
      return {
        responseText:
          "理解内容不能为空。可选格式：记录理解：[preference/writing] 写作默认保留我的表达气质",
        toolName: "personal_model_claim_create",
        riskLevel: "write_low",
        input: { text },
        output: { created: false }
      };
    }

    const now = context.runtime.now();
    const claim = await repositories.createPersonalModelClaim({
      id: context.runtime.generateId(),
      ownerTgUserId: context.ownerTgUserId,
      claim: parsedClaim.claim,
      layer: parsedClaim.layer,
      scenario: parsedClaim.scenario,
      confidence: "high",
      status: "active",
      usagePolicy: "default_available",
      sensitivity: "medium",
      validFrom: null,
      validUntil: null,
      lastConfirmedAt: now,
      metadataJson: JSON.stringify({
        source: "telegram_manual",
        syntax: text.includes("[") ? "typed" : "default"
      }),
      createdAt: now,
      updatedAt: now
    });
    await repositories.createPersonalModelEvent({
      id: context.runtime.generateId(),
      claimId: claim.id,
      ownerTgUserId: context.ownerTgUserId,
      eventType: "created",
      payloadJson: JSON.stringify({ source: "telegram_manual" }),
      createdAt: now
    });

    return {
      responseText: `已记录理解 ${claim.id}。`,
      toolName: "personal_model_claim_create",
      riskLevel: "write_low",
      input: {
        claim: parsedClaim.claim,
        layer: parsedClaim.layer,
        scenario: parsedClaim.scenario
      },
      output: { id: claim.id }
    };
  }

  const recordGap = RECORD_GAP_PATTERN.exec(text);
  if (recordGap) {
    const parsedGap = parsePersonalModelClaimInput(recordGap[1] ?? "");
    if (!parsedGap) {
      return {
        responseText: "缺口内容不能为空。可选格式：记录缺口：[preference/writing] 为什么不喜欢吃香菜",
        toolName: "record_understanding_gap",
        riskLevel: "write_low",
        input: { text },
        output: { created: false }
      };
    }
    const now = context.runtime.now();
    await repositories.createPersonalModelUnderstandingGap({
      id: context.runtime.generateId(),
      ownerTgUserId: context.ownerTgUserId,
      scenario: parsedGap.scenario,
      gapDescription: parsedGap.claim,
      status: "open",
      createdAt: now,
      updatedAt: now
    });
    return {
      responseText: `已记录认知缺口。`,
      toolName: "record_understanding_gap",
      riskLevel: "write_low",
      input: { scenario: parsedGap.scenario, gapDescription: parsedGap.claim },
      output: { recorded: true }
    };
  }

  const correctUnderstanding = CORRECT_UNDERSTANDING_PATTERN.exec(text);
  if (correctUnderstanding) {
    const content = trimRequired(correctUnderstanding[1] ?? "");
    if (!content) {
      return {
        responseText: "修正内容不能为空。",
        toolName: "record_metacognition_log",
        riskLevel: "write_low",
        input: { text },
        output: { recorded: false }
      };
    }
    const now = context.runtime.now();
    await repositories.createPersonalModelMetacognitionLog({
      id: context.runtime.generateId(),
      ownerTgUserId: context.ownerTgUserId,
      reflectionType: "correction",
      content,
      relatedClaimId: null,
      relatedGapId: null,
      createdAt: now
    });
    return {
      responseText: `已记录理解修正。`,
      toolName: "record_metacognition_log",
      riskLevel: "write_low",
      input: { content },
      output: { recorded: true }
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

function buildSkillInstructions(runnable: RunnableSkillRecord): string {
  return runnable.version.body;
}

function parseExplicitSkill(text: string): { name: string; inputText: string } | null {
  const explicit = EXPLICIT_SKILL_PATTERN.exec(text.trim());
  if (!explicit) {
    return null;
  }

  return {
    name: explicit[1] ?? "",
    inputText: (explicit[2] ?? "").trim()
  };
}

async function findExplicitSkillMatch(input: {
  ownerTgUserId: number;
  name: string;
  inputText: string;
  runtime: BotRuntime;
}): Promise<SkillMatch | null> {
  const runnable = await input.runtime.repositories.getRunnableSkillByName({
    ownerTgUserId: input.ownerTgUserId,
    name: input.name
  });

  if (!runnable || !runnable.version.validation.ok) {
    return null;
  }

  return {
    runnable,
    inputText: input.inputText,
    triggerType: "explicit_name",
    confidence: 1,
    reason: `explicit skill name ${input.name}`,
    candidatesJson: JSON.stringify([
      {
        name: runnable.version.name,
        confidence: 1,
        reason: "explicit skill name"
      }
    ])
  };
}

function parseSemanticRoutingJson(content: string): {
  matchedSkillName: string | null;
  confidence: number;
  reason: string;
  candidates: Array<{ name: string; confidence: number; reason?: string }>;
} | null {
  const jsonText = /\{[\s\S]*\}/u.exec(content)?.[0] ?? "";
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      matchedSkillName?: unknown;
      confidence?: unknown;
      reason?: unknown;
      candidates?: unknown;
    };
    return {
      matchedSkillName:
        typeof parsed.matchedSkillName === "string"
          ? parsed.matchedSkillName
          : null,
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.min(Math.max(parsed.confidence, 0), 1)
          : 0,
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "semantic route",
      candidates: Array.isArray(parsed.candidates)
        ? parsed.candidates.reduce<
            Array<{ name: string; confidence: number; reason?: string }>
          >((items, candidate) => {
            if (typeof candidate !== "object" || candidate === null) {
              return items;
            }
            const item = candidate as {
              name?: unknown;
              confidence?: unknown;
              reason?: unknown;
            };
            if (typeof item.name !== "string") {
              return items;
            }
            const normalized: {
              name: string;
              confidence: number;
              reason?: string;
            } = {
              name: item.name,
              confidence:
                typeof item.confidence === "number" &&
                Number.isFinite(item.confidence)
                  ? Math.min(Math.max(item.confidence, 0), 1)
                  : 0
            };
            if (typeof item.reason === "string") {
              normalized.reason = item.reason;
            }
            items.push(normalized);
            return items;
          }, [])
        : []
    };
  } catch {
    return null;
  }
}

async function findSemanticSkillMatch(input: {
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
}): Promise<{ match: SkillMatch | null; reason: string; candidatesJson: string }> {
  if (!input.runtime.llmClient) {
    return {
      match: null,
      reason: "semantic skill routing skipped: LLM not configured",
      candidatesJson: "[]"
    };
  }

  const runnableSkills = (
    await input.runtime.repositories.listRunnableSkills(input.ownerTgUserId)
  ).filter((runnable) => runnable.version.validation.ok);
  if (runnableSkills.length === 0) {
    return {
      match: null,
      reason: "no runnable skill packages",
      candidatesJson: "[]"
    };
  }

  const skillIntents = await input.runtime.repositories.listSkillIntents(
    input.ownerTgUserId
  );
  const skillCatalog = runnableSkills.map((runnable) => {
    const intentsForSkill = skillIntents
      .filter((intent) => intent.skillName === runnable.version.name)
      .map((intent) => intent.intentText);
    return {
      name: runnable.version.name,
      description: runnable.version.description,
      exampleIntents: intentsForSkill.length > 0 ? intentsForSkill : undefined
    };
  });
  const completion = await input.runtime.llmClient.createChatCompletion({
    messages: [
      {
        role: "system",
        content: `你是 skill 路由器。只根据用户输入和 skill 的 name/description/exampleIntents 判断是否应触发一个 skill。返回严格 JSON：{"matchedSkillName": string|null, "confidence": number, "reason": string, "candidates": [{"name": string, "confidence": number, "reason": string}] }。confidence 低于 ${ROUTING_CONFIDENCE_CONFIRM_THRESHOLD} 时 matchedSkillName 必须为 null。`
      },
      {
        role: "user",
        content: JSON.stringify({
          input: input.text,
          skills: skillCatalog
        })
      }
    ]
  });
  const parsed = parseSemanticRoutingJson(completion.content);
  if (!parsed) {
    return {
      match: null,
      reason: "semantic skill routing returned invalid JSON",
      candidatesJson: "[]"
    };
  }

  const candidatesJson = JSON.stringify(parsed.candidates);
  if (!parsed.matchedSkillName || parsed.confidence < ROUTING_CONFIDENCE_CONFIRM_THRESHOLD) {
    return {
      match: null,
      reason: parsed.reason || "semantic skill confidence below threshold",
      candidatesJson
    };
  }

  const runnable = runnableSkills.find(
    (candidate) => candidate.version.name === parsed.matchedSkillName
  );
  if (!runnable) {
    return {
      match: null,
      reason: `semantic skill ${parsed.matchedSkillName} is not runnable`,
      candidatesJson
    };
  }

  return {
    match: {
      runnable,
      inputText: input.text.trim(),
      triggerType: "semantic",
      confidence: parsed.confidence,
      reason: parsed.reason,
      candidatesJson
    },
    reason: parsed.reason,
    candidatesJson
  };
}

async function recordRouteDecision(input: {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: BotRuntime;
  match: SkillMatch | null;
  reason?: string;
  candidatesJson?: string;
}): Promise<void> {
  await input.runtime.repositories.createSkillRouteDecision({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    inputText: input.text,
    triggerType: input.match?.triggerType ?? "none",
    matchedSkillId: input.match?.runnable.skill.id ?? null,
    matchedSkillName: input.match?.runnable.version.name ?? null,
    matchedSkillVersionId: input.match?.runnable.version.id ?? null,
    confidence: input.match?.confidence ?? null,
    reason: input.match?.reason ?? input.reason ?? "no skill matched",
    candidatesJson: input.match?.candidatesJson ?? input.candidatesJson ?? "[]",
    createdAt: input.runtime.now()
  });
}

export async function executeSkill(input: {
  runId: string;
  ownerTgUserId: number;
  match: SkillMatch;
  runtime: BotRuntime;
}): Promise<CommandResult & { skillRunId: string }> {
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
  const allowedTools = allowedBuiltInToolsForSkill(
    input.match.runnable.version.metadata
  );

  try {
    const result = agentResultToCommandResult(
      await executeLlmAgent({
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        inputText: input.match.inputText,
        runtime: input.runtime,
        allowedTools,
        systemInstructions: buildSkillInstructions(input.match.runnable),
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

async function executeCommandOrSkillOrLlmFallback(input: {
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

  const semanticRoute = await findSemanticSkillMatch({
    ownerTgUserId: input.ownerTgUserId,
    text: input.text,
    runtime: input.runtime
  });
  await recordRouteDecision({
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    text: input.text,
    runtime: input.runtime,
    match: semanticRoute.match,
    reason: semanticRoute.reason,
    candidatesJson: semanticRoute.candidatesJson
  });
  if (semanticRoute.match) {
    if (semanticRoute.match.confidence >= ROUTING_CONFIDENCE_AUTO_RUN_THRESHOLD) {
      return executeSkill({
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        match: semanticRoute.match,
        runtime: input.runtime
      });
    } else {
      return {
        responseText: `我猜你可能是想执行技能「${semanticRoute.match.runnable.version.name}」，是否确认？`,
        toolName: "skill_confirm",
        riskLevel: "read",
        input: { name: semanticRoute.match.runnable.version.name },
        output: { pending: true, skillId: semanticRoute.match.runnable.skill.id }
      };
    }
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

  // Handle Feedback Callbacks
  const cbData = input.update.callback_query?.data;
  if (cbData && cbData.startsWith("fb_")) {
      const parts = cbData.split("_");
      if (parts.length >= 3) {
        const fbRunId = parts[1];
        const fbValue = parts.slice(2).join("_");

        const feedbackRun = await input.runtime.repositories.getRun({
          ownerTgUserId: input.ownerTgUserId,
          id: fbRunId
        });

        if (feedbackRun) {
          if (fbValue === "negative") {
            // Ask for specific reason
            await input.runtime.telegramClient.sendMessage({
              chatId,
              text: "请告诉我这条回答哪里不合适？",
              replyMarkup: {
                inline_keyboard: [
                  [
                    { text: "情绪误判", callback_data: `fb_${fbRunId}_emotion_misjudgment` },
                    { text: "旧资料误用", callback_data: `fb_${fbRunId}_old_data_misuse` }
                  ],
                  [
                    { text: "建议不适", callback_data: `fb_${fbRunId}_advice_mismatch` },
                    { text: "过度挑战", callback_data: `fb_${fbRunId}_over_challenged` }
                  ],
                  [
                    { text: "过度顺从", callback_data: `fb_${fbRunId}_over_compliant` }
                  ]
                ]
              }
            });
            return { runId };
          }

          // Otherwise it's positive or a specific negative reason
          await input.runtime.repositories.createRunFeedback({
            id: input.runtime.generateId(),
            runId: fbRunId,
            ownerTgUserId: input.ownerTgUserId,
            feedbackType: fbValue as any,
            comment: fbValue,
            createdAt: now
          });

          // Feedback closure: write a metacognition log if it's a specific negative reason
          if (fbValue !== "positive" && feedbackRun.contextTraceJson) {
            const trace = JSON.parse(feedbackRun.contextTraceJson);
            if (trace?.selectedClaimIds?.length > 0) {
               const claimId = trace.selectedClaimIds[0];
               await input.runtime.repositories.createPersonalModelMetacognitionLog({
                  id: input.runtime.generateId(),
                  ownerTgUserId: input.ownerTgUserId,
                  relatedClaimId: claimId,
                  relatedGapId: null,
                  reflectionType: "correction",
                  content: `用户对最近的回复表示不满（${fbValue}），可能需要修正此记忆。`,
                  createdAt: now
               });
               
               // Update claim status to under_revision
               await input.runtime.repositories.updatePersonalModelClaim({
                 ownerTgUserId: input.ownerTgUserId,
                 id: claimId,
                 patch: { status: "under_revision" },
                 updatedAt: now
               });
            }
          }

          await input.runtime.telegramClient.sendMessage({
            chatId,
            text: fbValue === "positive" ? "收到反馈，谢谢肯定！" : "收到反馈，我会反思这次的回答并进入修正流程。"
          });
        }
        return { runId };
    }
  } else if (cbData && cbData.startsWith("sc_")) {
    const confirmedRunId = cbData.substring(3);
    const routeDecision = await input.runtime.repositories.getSkillRouteDecisionForRun({
      ownerTgUserId: input.ownerTgUserId,
      runId: confirmedRunId
    });
    if (routeDecision && routeDecision.matchedSkillName) {
      const runnable = await input.runtime.repositories.getRunnableSkillByName({
        ownerTgUserId: input.ownerTgUserId,
        name: routeDecision.matchedSkillName
      });
      if (runnable) {
        if (input.update.callback_query?.message?.message_id) {
          await input.runtime.telegramClient.editMessageText({
            chatId,
            messageId: input.update.callback_query.message.message_id,
            text: `确认执行 ${runnable.version.name}，处理中...`,
            replyMarkup: { inline_keyboard: [] }
          }).catch(() => {});
        }
        const run = await input.runtime.repositories.createRun({
          id: runId,
          ownerTgUserId: input.ownerTgUserId,
          chatId,
          updateId: input.update.update_id,
          messageText: routeDecision.inputText,
          createdAt: now,
          updatedAt: now
        });
        try {
          const match: SkillMatch = {
            runnable,
            inputText: routeDecision.inputText,
            triggerType: routeDecision.triggerType,
            confidence: routeDecision.confidence ?? 1,
            reason: routeDecision.reason,
            candidatesJson: routeDecision.candidatesJson
          };
          const skillResult = await executeSkill({
            runId: run.id,
            ownerTgUserId: input.ownerTgUserId,
            match,
            runtime: input.runtime
          });
          await input.runtime.telegramClient.sendMessage({
            chatId,
            text: skillResult.responseText
          });
          await input.runtime.repositories.updateRun(run.id, {
            status: "succeeded",
            responseText: skillResult.responseText,
            error: null,
            contextTraceJson: skillResult.contextTraceJson,
            updatedAt: input.runtime.now()
          });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "执行失败";
          await input.runtime.telegramClient.sendMessage({
            chatId,
            text: `执行失败：${errorMsg}`
          });
          await input.runtime.repositories.updateRun(run.id, {
            status: "failed",
            responseText: null,
            error: errorMsg,
            contextTraceJson: contextTraceJsonFromError(e),
            updatedAt: input.runtime.now()
          });
        }
      }
    }
    return { runId };
  } else if (cbData && cbData.startsWith("sx_")) {
    if (input.update.callback_query?.message?.message_id) {
      await input.runtime.telegramClient.editMessageText({
        chatId,
        messageId: input.update.callback_query.message.message_id,
        text: "已取消执行。",
        replyMarkup: { inline_keyboard: [] }
      }).catch(() => {});
    }
    return { runId };
  } else if (cbData && cbData.startsWith("long_task_action_")) {
    const parts = cbData.split("_");
    if (parts.length >= 4) {
      const action = parts[3]; // confirm, skip, cancel, retry
      const taskId = parts.slice(4).join("_");
      console.error("PARSED ACTION:", action, "TASKID:", taskId);
      
      const task = await input.runtime.repositories.getLongTask({
        ownerTgUserId: input.ownerTgUserId,
        id: taskId
      });
      
      if (task) {
        if (action === "cancel") {
          const { canCancelLongTask } = await import("./longTasks.js");
          if (!canCancelLongTask(task)) {
             await input.runtime.telegramClient.answerCallbackQuery({
               callbackQueryId: input.update.callback_query?.id ?? "",
               text: "不能取消已完成的长任务",
               showAlert: true
             }).catch(() => {});
             return { runId };
          }
          console.error("EXECUTE CANCEL FOR", task.id);
          await input.runtime.repositories.updateLongTask({
            id: task.id,
            status: "cancelled",
            currentStepId: task.currentStepId,
            outputText: task.outputText,
            error: "用户取消",
            updatedAt: now
          });
          await input.runtime.repositories.createLongTaskEvent({
            id: input.runtime.generateId(),
            longTaskId: task.id,
            ownerTgUserId: input.ownerTgUserId,
            stepId: null,
            eventType: "cancelled",
            payloadJson: JSON.stringify({ source: "telegram_callback" }),
            createdAt: now
          });
          const cancelledTask = await input.runtime.repositories.getLongTask({ ownerTgUserId: input.ownerTgUserId, id: task.id });
          if (cancelledTask) {
            await syncLongTaskMessage({ runtime: input.runtime, task: cancelledTask });
          }
        } else if (action === "confirm" || action === "skip") {
          if (task.status !== "waiting_for_user") {
             await input.runtime.telegramClient.answerCallbackQuery({
               callbackQueryId: input.update.callback_query?.id ?? "",
               text: "当前状态无法继续",
               showAlert: true
             }).catch(() => {});
             return { runId };
          }
          const steps = await input.runtime.repositories.listLongTaskSteps(task.id);
          const blocked = steps.find((step) => step.status === "blocked");
          if (blocked) {
            await input.runtime.repositories.updateLongTaskStep({
              id: blocked.id,
              status: action === "confirm" ? "succeeded" : "skipped",
              outputJson: JSON.stringify(action === "confirm" ? { confirmedByUser: true } : { skippedByUser: true }),
              error: null,
              completedAt: now
            });
          }
          await input.runtime.repositories.updateLongTask({
            id: task.id,
            status: "running",
            currentStepId: task.currentStepId,
            outputText: task.outputText,
            error: null,
            updatedAt: now
          });
          await input.runtime.repositories.createLongTaskEvent({
            id: input.runtime.generateId(),
            longTaskId: task.id,
            ownerTgUserId: input.ownerTgUserId,
            stepId: blocked?.id ?? null,
            eventType: "resumed",
            payloadJson: JSON.stringify({ source: "telegram_callback", action }),
            createdAt: now
          });
          
          const runningTask = await input.runtime.repositories.getLongTask({ ownerTgUserId: input.ownerTgUserId, id: task.id });
          if (runningTask) {
            await syncLongTaskMessage({ runtime: input.runtime, task: runningTask });
            // Run in background without awaiting so the callback is answered quickly
            executeLongTaskForRecord({ runtime: input.runtime, task: runningTask }).catch(console.error);
          }
        } else if (action === "retry") {
          if (task.status !== "failed") {
             await input.runtime.telegramClient.answerCallbackQuery({
               callbackQueryId: input.update.callback_query?.id ?? "",
               text: "当前状态无法重试",
               showAlert: true
             }).catch(() => {});
             return { runId };
          }
          await input.runtime.repositories.updateLongTask({
            id: task.id,
            status: "running",
            currentStepId: task.currentStepId,
            outputText: task.outputText,
            error: null,
            updatedAt: now
          });
          await input.runtime.repositories.createLongTaskEvent({
            id: input.runtime.generateId(),
            longTaskId: task.id,
            ownerTgUserId: input.ownerTgUserId,
            stepId: task.currentStepId,
            eventType: "resumed",
            payloadJson: JSON.stringify({ source: "telegram_callback", action: "retry" }),
            createdAt: now
          });
          
          const retryingTask = await input.runtime.repositories.getLongTask({ ownerTgUserId: input.ownerTgUserId, id: task.id });
          if (retryingTask) {
            await syncLongTaskMessage({ runtime: input.runtime, task: retryingTask });
            executeLongTaskForRecord({ runtime: input.runtime, task: retryingTask }).catch(console.error);
          }
        }
      }
      
      if (input.update.callback_query?.id) {
        await input.runtime.telegramClient.answerCallbackQuery({
          callbackQueryId: input.update.callback_query.id,
          text: "操作已收到"
        }).catch(e => console.error("Failed to answer callback query", e));
      }
      
      return { runId };
    }
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
    const messageText = text ?? "";
    const explicitSkill = parseExplicitSkill(messageText);
    let matchedSkill: SkillMatch | null = null;
    let result: CommandResult & { skillRunId?: string };

    if (explicitSkill) {
      matchedSkill = await findExplicitSkillMatch({
        ownerTgUserId: input.ownerTgUserId,
        name: explicitSkill.name,
        inputText: explicitSkill.inputText,
        runtime: input.runtime
      });
      await recordRouteDecision({
        runId: run.id,
        ownerTgUserId: input.ownerTgUserId,
        text: messageText,
        runtime: input.runtime,
        match: matchedSkill,
        reason: matchedSkill
          ? undefined
          : `没有找到 skill ${explicitSkill.name}`,
        candidatesJson: "[]"
      });

      result = matchedSkill
        ? await executeSkill({
          runId: run.id,
          ownerTgUserId: input.ownerTgUserId,
            match: matchedSkill,
          runtime: input.runtime
        })
        : {
            responseText: `没有找到 skill ${explicitSkill.name}`,
            toolName: "skill_not_found",
            riskLevel: "read",
            input: { name: explicitSkill.name },
            output: { found: false }
          };
    } else {
      result = agentResultToCommandResult(
          await executeCommandOrSkillOrLlmFallback({
            runId: run.id,
            ownerTgUserId: input.ownerTgUserId,
          text: messageText,
            runtime: input.runtime
          })
        );
    }

    if (
      !matchedSkill && result.toolName !== "llm_agent"
    ) {
      await recordToolCall(
        {
          runId: run.id,
          ownerTgUserId: input.ownerTgUserId,
          text: messageText,
          runtime: input.runtime
        },
        result,
        "succeeded"
      );
    }

    try {
      const inlineKeyboard =
        result.toolName === "llm_agent"
          ? {
              inline_keyboard: [
                [
                  { text: "👍 准确", callback_data: `fb_${run.id}_positive` },
                  { text: "👎 有误", callback_data: `fb_${run.id}_negative` }
                ]
              ]
            }
          : result.toolName === "skill_confirm"
          ? {
              inline_keyboard: [
                [
                  { text: "确认执行", callback_data: `sc_${run.id}` },
                  { text: "取消", callback_data: `sx_${run.id}` }
                ]
              ]
            }
          : undefined;

      const msgResp = await input.runtime.telegramClient.sendMessage({
        chatId,
        text: result.responseText,
        replyMarkup: inlineKeyboard
      });
      
      if (
        result.toolName === "long_task_start" &&
        typeof result.output === "object" &&
        result.output !== null &&
        "taskId" in result.output
      ) {
        const currentTask = await input.runtime.repositories.getLongTask({
          ownerTgUserId: input.ownerTgUserId,
          id: result.output.taskId as string
        });
        if (currentTask) {
          await input.runtime.repositories.updateLongTask({
            id: currentTask.id,
            status: currentTask.status,
            telegramChatId: chatId,
            telegramMessageId: msgResp.messageId,
            updatedAt: input.runtime.now()
          });
        }
      }
      await input.runtime.repositories.updateRun(run.id, {
        status: "succeeded",
        responseText: result.responseText,
        error: null,
        contextTraceJson: result.contextTraceJson,
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
        contextTraceJson: result.contextTraceJson,
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
      contextTraceJson: contextTraceJsonFromError(commandError),
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
