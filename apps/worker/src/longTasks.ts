import {
  builtInToolNames,
  type BuiltInToolName,
  type LongTaskToolPolicy
} from "@personal-agent/shared";
import { executeLlmAgent, type AgentRuntime } from "./agent.js";
import { type LlmMessage } from "./llm.js";
import {
  type AgentRepositories,
  type LongTaskRecord,
  type LongTaskStepRecord
} from "./repositories.js";
import { type TelegramClient } from "./telegram.js";

const maxLongTaskSteps = 12;
const maxStepsPerTick = 3;

export interface LongTaskRuntime extends AgentRuntime {
  repositories: AgentRepositories;
  telegramClient: TelegramClient;
  maxToolRounds: number;
}

export interface ComplexityDecision {
  mode: "simple" | "long_task";
  score: number;
  reason: string;
  needsUserConfirmation: boolean;
}

interface PlannedStep {
  title: string;
  description: string;
  toolPolicy: LongTaskToolPolicy;
  successCriteria: string;
}

interface LongTaskPlan {
  title: string;
  steps: PlannedStep[];
  userConfirmationRequired: boolean;
  confirmationQuestion: string | null;
}

const terminalTaskStatuses = ["succeeded", "failed", "cancelled"] as const;
const pauseableTaskStatuses = ["planning", "running", "waiting_for_user"] as const;
const resumableTaskStatuses = ["paused", "waiting_for_user"] as const;
const cancellableTaskStatuses = [
  "planning",
  "running",
  "waiting_for_user",
  "paused"
] as const;

const longTaskPatterns = [
  /调研/u,
  /研究/u,
  /比较/u,
  /对比/u,
  /报告/u,
  /规划/u,
  /计划/u,
  /方案/u,
  /分析/u,
  /总结.*来源/u,
  /多步/u,
  /持续/u,
  /监控/u,
  /整理.*资料/u,
  /查找.*并/u,
  /搜索.*并/u
];

export function classifyTaskComplexity(text: string): ComplexityDecision {
  const normalized = text.trim();
  if (!normalized) {
    return {
      mode: "simple",
      score: 0,
      reason: "empty input",
      needsUserConfirmation: false
    };
  }

  const matched = longTaskPatterns.find((pattern) => pattern.test(normalized));
  if (matched) {
    return {
      mode: "long_task",
      score: 0.82,
      reason: `matched long-task heuristic ${matched.source}`,
      needsUserConfirmation: false
    };
  }

  if (normalized.length >= 120 && /[，。；,;].*[，。；,;]/u.test(normalized)) {
    return {
      mode: "long_task",
      score: 0.7,
      reason: "long multi-clause request",
      needsUserConfirmation: false
    };
  }

  return {
    mode: "simple",
    score: 0.2,
    reason: "no long-task heuristic matched",
    needsUserConfirmation: false
  };
}


export function canPauseLongTask(task: LongTaskRecord): boolean {
  return pauseableTaskStatuses.includes(
    task.status as (typeof pauseableTaskStatuses)[number]
  );
}

export function canResumeLongTask(task: LongTaskRecord): boolean {
  return resumableTaskStatuses.includes(
    task.status as (typeof resumableTaskStatuses)[number]
  );
}

export function canCancelLongTask(task: LongTaskRecord): boolean {
  return cancellableTaskStatuses.includes(
    task.status as (typeof cancellableTaskStatuses)[number]
  );
}

export function isTerminalLongTask(task: LongTaskRecord): boolean {
  return terminalTaskStatuses.includes(
    task.status as (typeof terminalTaskStatuses)[number]
  );
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Planner returned no JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function policyField(value: unknown): LongTaskToolPolicy {
  return value === "none" ||
    value === "read" ||
    value === "write_low" ||
    value === "external_send" ||
    value === "destructive"
    ? value
    : "read";
}

function normalizePlan(raw: unknown): LongTaskPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Planner returned invalid JSON");
  }
  const record = raw as Record<string, unknown>;
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  if (rawSteps.length === 0) {
    throw new Error("Planner returned empty steps");
  }
  if (rawSteps.length > maxLongTaskSteps) {
    throw new Error(`Planner returned more than ${maxLongTaskSteps} steps`);
  }

  return {
    title: stringField(record.title, "长任务"),
    steps: rawSteps.map((step, index) => {
      const item =
        step && typeof step === "object" && !Array.isArray(step)
          ? (step as Record<string, unknown>)
          : {};
      return {
        title: stringField(item.title, `步骤 ${index + 1}`),
        description: stringField(item.description, ""),
        toolPolicy: policyField(item.toolPolicy),
        successCriteria: stringField(item.successCriteria, "完成该步骤")
      };
    }),
    userConfirmationRequired: record.userConfirmationRequired === true,
    confirmationQuestion:
      typeof record.confirmationQuestion === "string"
        ? record.confirmationQuestion
        : null
  };
}

async function recordLongTaskEvent(input: {
  runtime: LongTaskRuntime;
  task: LongTaskRecord;
  stepId?: string | null;
  eventType: string;
  payload: unknown;
}) {
  await input.runtime.repositories.createLongTaskEvent({
    id: input.runtime.generateId(),
    longTaskId: input.task.id,
    ownerTgUserId: input.task.ownerTgUserId,
    stepId: input.stepId ?? null,
    eventType: input.eventType,
    payloadJson: JSON.stringify(input.payload),
    createdAt: input.runtime.now()
  });
}

async function recordPlanningCall(input: {
  runtime: LongTaskRuntime;
  runId: string;
  ownerTgUserId: number;
  messages: LlmMessage[];
  content: string;
}) {
  await input.runtime.repositories.recordToolCall({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    toolName: "long_task_planner",
    riskLevel: "external_send",
    status: "succeeded",
    inputJson: JSON.stringify({ messageCount: input.messages.length }),
    outputJson: JSON.stringify({ content: input.content }),
    error: null,
    createdAt: input.runtime.now()
  });
}

export async function createLongTaskPlan(input: {
  runtime: LongTaskRuntime;
  runId: string;
  ownerTgUserId: number;
  text: string;
}): Promise<LongTaskPlan> {
  if (!input.runtime.llmClient) {
    throw new Error("LLM is not configured");
  }

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: [
        "你是个人 Agent 的长任务规划器。",
        "只输出 JSON object，不要 Markdown。",
        "JSON 字段：title, steps, userConfirmationRequired, confirmationQuestion。",
        "steps 每项字段：title, description, toolPolicy, successCriteria。",
        "toolPolicy 只能是 none/read/write_low/external_send/destructive。",
        `steps 数量必须在 1 到 ${maxLongTaskSteps} 之间。`
      ].join("\n")
    },
    {
      role: "user",
      content: input.text
    }
  ];

  const completion = await input.runtime.llmClient.createChatCompletion({
    messages,
    thinkingTier: "max"
  });
  await recordPlanningCall({
    runtime: input.runtime,
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    messages,
    content: completion.content
  });

  return normalizePlan(extractJsonObject(completion.content));
}

function allowedToolsForPolicy(policy: LongTaskToolPolicy): Set<string> {
  const read: BuiltInToolName[] = ["list_todos", "search_memory"];
  const writeLow: BuiltInToolName[] = [
    ...read,
    "create_todo",
    "complete_todo",
    "save_memory"
  ];
  const external: BuiltInToolName[] = [...writeLow, "web_search", "fetch_url"];

  if (policy === "none") {
    return new Set();
  }
  if (policy === "read") {
    return new Set(read);
  }
  if (policy === "write_low") {
    return new Set(writeLow);
  }
  if (policy === "external_send") {
    return new Set(external);
  }

  return new Set(builtInToolNames);
}

function formatPlanSummary(task: LongTaskRecord, steps: PlannedStep[]): string {
  return [
    `已创建长任务 ${task.id}：${task.title}`,
    "计划：",
    ...steps.map((step, index) => `${index + 1}. ${step.title}`)
  ].join("\n");
}

export function formatCompletedLongTask(
  task: LongTaskRecord,
  outputText: string
): string {
  return [`长任务 ${task.id} 已完成：${task.title}`, outputText].join("\n\n");
}

export async function startLongTask(input: {
  runId: string;
  ownerTgUserId: number;
  text: string;
  decision: ComplexityDecision;
  runtime: LongTaskRuntime;
}): Promise<{ task: LongTaskRecord; responseText: string }> {
  const now = input.runtime.now();
  const task = await input.runtime.repositories.createLongTask({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    title: "长任务规划中",
    originalInput: input.text,
    status: "planning",
    complexityScore: input.decision.score,
    plannerReason: input.decision.reason,
    currentStepId: null,
    outputText: null,
    error: null,
    replanCount: 0,
    telegramChatId: null,
    telegramMessageId: null,
    createdAt: now,
    updatedAt: now
  });

  await recordLongTaskEvent({
    runtime: input.runtime,
    task,
    eventType: "classified",
    payload: input.decision
  });

  try {
    const plan = await createLongTaskPlan({
      runtime: input.runtime,
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      text: input.text
    });
    await input.runtime.repositories.updateLongTask({
      id: task.id,
      status: plan.userConfirmationRequired ? "waiting_for_user" : "running",
      title: plan.title,
      plannerReason: input.decision.reason,
      currentStepId: null,
      outputText: null,
      error: null,
      updatedAt: input.runtime.now()
    });
    const plannedTask = {
      ...task,
      title: plan.title,
      status: plan.userConfirmationRequired ? "waiting_for_user" : "running"
    } satisfies LongTaskRecord;

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index] as PlannedStep;
      await input.runtime.repositories.createLongTaskStep({
        id: input.runtime.generateId(),
        longTaskId: task.id,
        ownerTgUserId: input.ownerTgUserId,
        position: index + 1,
        title: step.title,
        description: step.description,
        status: "pending",
        toolPolicy: step.toolPolicy,
        successCriteria: step.successCriteria,
        inputJson: JSON.stringify(step),
        outputJson: null,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: input.runtime.now()
      });
    }

    await recordLongTaskEvent({
      runtime: input.runtime,
      task: plannedTask,
      eventType: "planned",
      payload: plan
    });

    const responseText = formatPlanSummary(plannedTask, plan.steps);
    if (!plan.userConfirmationRequired) {
      await executeLongTaskForRecord({
        runtime: input.runtime,
        task: plannedTask,
        maxSteps: maxStepsPerTick
      });
    }

    const updatedTask = await input.runtime.repositories.getLongTask({
      ownerTgUserId: input.ownerTgUserId,
      id: task.id
    });
    const completedText =
      updatedTask?.status === "succeeded" && updatedTask.outputText
        ? `\n\n${formatCompletedLongTask(updatedTask, updatedTask.outputText)}`
        : "";

    return { task: updatedTask ?? plannedTask, responseText: responseText + completedText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Long task failed";
    await input.runtime.repositories.updateLongTask({
      id: task.id,
      status: "failed",
      currentStepId: null,
      outputText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
    await recordLongTaskEvent({
      runtime: input.runtime,
      task,
      eventType: "failed",
      payload: { error: message }
    });
    throw error;
  }
}

function stepPrompt(task: LongTaskRecord, step: LongTaskStepRecord): string {
  return [
    `长任务：${task.title}`,
    `原始请求：${task.originalInput}`,
    `当前步骤：${step.title}`,
    step.description ? `步骤说明：${step.description}` : "",
    `成功标准：${step.successCriteria}`,
    "请只完成当前步骤，输出本步骤结果。"
  ]
    .filter(Boolean)
    .join("\n");
}

export async function syncLongTaskMessage(input: {
  runtime: LongTaskRuntime;
  task: LongTaskRecord;
}): Promise<void> {
  if (!input.task.telegramChatId || !input.task.telegramMessageId) {
    return;
  }
  
  const steps = await input.runtime.repositories.listLongTaskSteps(input.task.id);
  const text = input.task.status === "succeeded" && input.task.outputText
    ? formatCompletedLongTask(input.task, input.task.outputText)
    : formatLongTaskStatus({ task: input.task, steps });
    
  let inline_keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  
  if (input.task.status === "running" || input.task.status === "planning" || input.task.status === "paused") {
    inline_keyboard.push([
      { text: "取消", callback_data: `long_task_action_cancel_${input.task.id}` }
    ]);
  } else if (input.task.status === "waiting_for_user") {
    inline_keyboard.push([
      { text: "✅ 确认", callback_data: `long_task_action_confirm_${input.task.id}` },
      { text: "⏭️ 跳过", callback_data: `long_task_action_skip_${input.task.id}` },
      { text: "❌ 取消", callback_data: `long_task_action_cancel_${input.task.id}` }
    ]);
  } else if (input.task.status === "failed") {
    inline_keyboard.push([
      { text: "🔄 重试", callback_data: `long_task_action_retry_${input.task.id}` },
      { text: "❌ 取消", callback_data: `long_task_action_cancel_${input.task.id}` }
    ]);
  }

  try {
    await input.runtime.telegramClient.editMessageText({
      chatId: input.task.telegramChatId,
      messageId: input.task.telegramMessageId,
      text,
      replyMarkup: inline_keyboard.length > 0 ? { inline_keyboard } : undefined
    });
    await recordLongTaskEvent({
      runtime: input.runtime,
      task: input.task,
      eventType: "notified",
      payload: { chatId: input.task.telegramChatId }
    });
  } catch (error) {
    await recordLongTaskEvent({
      runtime: input.runtime,
      task: input.task,
      eventType: "notification_failed",
      payload: {
        error: error instanceof Error ? error.message : "Telegram sync failed"
      }
    });
  }
}

async function finalizeLongTaskIfDone(input: {
  runtime: LongTaskRuntime;
  task: LongTaskRecord;
  notifyOnCompletion: boolean;
}): Promise<LongTaskRecord | null> {
  const steps = await input.runtime.repositories.listLongTaskSteps(input.task.id);
  const failed = steps.find((item) => item.status === "failed");
  const allSucceeded =
    steps.length > 0 &&
    steps.every((item) => ["succeeded", "skipped"].includes(item.status));

  if (failed) {
    const updatedTask = {
      ...input.task,
      status: "failed" as const,
      currentStepId: failed.id,
      outputText: null,
      error: failed.error,
      updatedAt: input.runtime.now()
    };
    await input.runtime.repositories.updateLongTask({
      id: input.task.id,
      status: "failed",
      currentStepId: failed.id,
      outputText: null,
      error: failed.error,
      updatedAt: updatedTask.updatedAt
    });
    await syncLongTaskMessage({ runtime: input.runtime, task: updatedTask });
    return updatedTask;
  }

  if (!allSucceeded) {
    return null;
  }

  const outputText =
    steps
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((item) => item.outputJson)
      .filter(Boolean)
      .join("\n\n") || "长任务已完成。";
  const updatedTask = {
    ...input.task,
    status: "succeeded" as const,
    currentStepId: null,
    outputText,
    error: null,
    updatedAt: input.runtime.now()
  };
  await input.runtime.repositories.updateLongTask({
    id: input.task.id,
    status: "succeeded",
    currentStepId: null,
    outputText,
    error: null,
    updatedAt: updatedTask.updatedAt
  });
  await recordLongTaskEvent({
    runtime: input.runtime,
    task: input.task,
    eventType: "succeeded",
    payload: { stepCount: steps.length }
  });
  if (input.notifyOnCompletion) {
    await syncLongTaskMessage({
      runtime: input.runtime,
      task: updatedTask
    });
  }
  return updatedTask;
}

export async function executeLongTaskForRecord(input: {
  runtime: LongTaskRuntime;
  task: LongTaskRecord;
  maxSteps?: number;
  notifyOnCompletion?: boolean;
}): Promise<void> {
  let task = input.task;
  const maxSteps = input.maxSteps ?? maxStepsPerTick;
  const notifyOnCompletion = input.notifyOnCompletion ?? false;

  for (let index = 0; index < maxSteps; index += 1) {
    if (task.status !== "running") {
      return;
    }

    const step = await input.runtime.repositories.claimNextLongTaskStep({
      longTaskId: task.id,
      startedAt: input.runtime.now()
    });
    if (!step) {
      await finalizeLongTaskIfDone({
        runtime: input.runtime,
        task,
        notifyOnCompletion
      });
      return;
    }

    await input.runtime.repositories.updateLongTask({
      id: task.id,
      status: "running",
      currentStepId: step.id,
      outputText: null,
      error: null,
      updatedAt: input.runtime.now()
    });
    await recordLongTaskEvent({
      runtime: input.runtime,
      task,
      stepId: step.id,
      eventType: "step_started",
      payload: { title: step.title, position: step.position }
    });
    
    const runningTaskForSync = await input.runtime.repositories.getLongTask({
      ownerTgUserId: task.ownerTgUserId,
      id: task.id
    });
    if (runningTaskForSync) {
      await syncLongTaskMessage({ runtime: input.runtime, task: runningTaskForSync });
    }

    if (step.toolPolicy === "destructive") {
      await input.runtime.repositories.updateLongTaskStep({
        id: step.id,
        status: "blocked",
        outputJson: null,
        error: "Destructive step requires user confirmation",
        completedAt: input.runtime.now()
      });
      await input.runtime.repositories.updateLongTask({
        id: task.id,
        status: "waiting_for_user",
        currentStepId: step.id,
        outputText: null,
        error: "等待用户确认高风险步骤",
        updatedAt: input.runtime.now()
      });
      await recordLongTaskEvent({
        runtime: input.runtime,
        task,
        stepId: step.id,
        eventType: "waiting_for_user",
        payload: { reason: "destructive step" }
      });
      const updatedTaskForSync = await input.runtime.repositories.getLongTask({
        ownerTgUserId: task.ownerTgUserId,
        id: task.id
      });
      if (updatedTaskForSync) {
        await syncLongTaskMessage({ runtime: input.runtime, task: updatedTaskForSync });
      }
      return;
    }

    try {
      const result = await executeLlmAgent({
        runId: task.runId,
        sessionId: task.runId,
        ownerTgUserId: task.ownerTgUserId,
        inputText: stepPrompt(task, step),
        runtime: input.runtime,
        allowedTools: allowedToolsForPolicy(step.toolPolicy),
        systemInstructions: "你正在执行长任务的一个步骤。只完成当前步骤。",
        maxToolRounds: input.runtime.maxToolRounds
      });
      await input.runtime.repositories.updateLongTaskStep({
        id: step.id,
        status: "succeeded",
        outputJson: JSON.stringify(result.output),
        error: null,
        completedAt: input.runtime.now()
      });
      await recordLongTaskEvent({
        runtime: input.runtime,
        task,
        stepId: step.id,
        eventType: "step_succeeded",
        payload: { responseText: result.responseText }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Long task step failed";
      await input.runtime.repositories.updateLongTaskStep({
        id: step.id,
        status: "failed",
        outputJson: null,
        error: message,
        completedAt: input.runtime.now()
      });
      await input.runtime.repositories.updateLongTask({
        id: task.id,
        status: "failed",
        currentStepId: step.id,
        outputText: null,
        error: message,
        updatedAt: input.runtime.now()
      });
      await recordLongTaskEvent({
        runtime: input.runtime,
        task,
        stepId: step.id,
        eventType: "step_failed",
        payload: { error: message }
      });
      return;
    }

    task = {
      ...task,
      status: "running",
      currentStepId: step.id,
      updatedAt: input.runtime.now()
    };
  }

  await finalizeLongTaskIfDone({
    runtime: input.runtime,
    task,
    notifyOnCompletion
  });
}

export async function resumeDueLongTasks(input: {
  runtime: LongTaskRuntime;
  now: number;
  limit?: number;
}): Promise<{ checked: number; resumed: number }> {
  const tasks = await input.runtime.repositories.listResumableLongTasks(
    input.now,
    input.limit ?? 10
  );
  let resumed = 0;

  for (const task of tasks) {
    resumed += 1;
    await executeLongTaskForRecord({
      runtime: input.runtime,
      task,
      maxSteps: maxStepsPerTick,
      notifyOnCompletion: true
    });
  }

  return { checked: tasks.length, resumed };
}

export function formatLongTaskStatus(input: {
  task: LongTaskRecord;
  steps: LongTaskStepRecord[];
}): string {
  const done = input.steps.filter((step) =>
    ["succeeded", "skipped"].includes(step.status)
  ).length;
  const current =
    input.steps.find((step) => step.id === input.task.currentStepId) ??
    input.steps.find((step) => step.status === "pending") ??
    null;
  return [
    `${input.task.id} ${input.task.title}`,
    `状态：${input.task.status} (${done}/${input.steps.length})`,
    current ? `当前：${current.position}. ${current.title}` : null,
    input.task.error ? `问题：${input.task.error}` : null
  ]
    .filter(Boolean)
    .join("\n");
}
