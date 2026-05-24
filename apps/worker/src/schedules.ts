import { adminScheduleUpsertRequestSchema } from "@personal-agent/shared";
import { executeCommand, type BotRuntime } from "./bot.js";
import {
  type ScheduleExecutionRecord,
  type ScheduleRecord
} from "./repositories.js";

const shanghaiOffsetMs = 8 * 60 * 60 * 1000;

function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid timeOfDay");
  }
  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "", 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Invalid timeOfDay");
  }
  return { hour, minute };
}

function localDateParts(utcMs: number) {
  const date = new Date(utcMs + shanghaiOffsetMs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    isoDayOfWeek: date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  };
}

function localCandidateToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): number {
  return (
    Date.UTC(input.year, input.month, input.day, input.hour, input.minute) -
    shanghaiOffsetMs
  );
}

export function nextScheduleRunAt(input: {
  cadence: "daily" | "weekly";
  timeOfDay: string;
  daysOfWeek: number[];
  after: number;
}): number {
  const time = parseTimeOfDay(input.timeOfDay);
  const parts = localDateParts(input.after);
  const allowedDays =
    input.cadence === "weekly" && input.daysOfWeek.length > 0
      ? new Set(input.daysOfWeek)
      : null;

  for (let offset = 0; offset <= 14; offset += 1) {
    const localMidnight = Date.UTC(parts.year, parts.month, parts.day + offset);
    const local = new Date(localMidnight);
    const isoDayOfWeek =
      local.getUTCDay() === 0 ? 7 : local.getUTCDay();

    if (allowedDays && !allowedDays.has(isoDayOfWeek)) {
      continue;
    }

    const candidate = localCandidateToUtc({
      year: local.getUTCFullYear(),
      month: local.getUTCMonth(),
      day: local.getUTCDate(),
      hour: time.hour,
      minute: time.minute
    });

    if (candidate > input.after) {
      return candidate;
    }
  }

  throw new Error("Failed to calculate next schedule run");
}

export function normalizeScheduleRequest(input: unknown) {
  const parsed = adminScheduleUpsertRequestSchema.parse(input);
  return {
    ...parsed,
    daysOfWeek:
      parsed.cadence === "weekly"
        ? Array.from(new Set(parsed.daysOfWeek)).sort()
        : []
  };
}

async function recordScheduleToolCall(input: {
  runtime: BotRuntime;
  runId: string;
  ownerTgUserId: number;
  result: Awaited<ReturnType<typeof executeCommand>>;
}) {
  await input.runtime.repositories.recordToolCall({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    toolName: input.result.toolName,
    riskLevel: input.result.riskLevel,
    status: "succeeded",
    inputJson: JSON.stringify(input.result.input),
    outputJson: JSON.stringify(input.result.output),
    error: null,
    createdAt: input.runtime.now()
  });
}

export async function executeScheduleCommand(input: {
  schedule: ScheduleRecord;
  execution: ScheduleExecutionRecord;
  runtime: BotRuntime;
}): Promise<void> {
  const now = input.runtime.now();
  const run = await input.runtime.repositories.createRun({
    id: input.runtime.generateId(),
    ownerTgUserId: input.schedule.ownerTgUserId,
    chatId: input.schedule.ownerTgUserId,
    updateId: null,
    messageText: input.schedule.commandText,
    createdAt: now,
    updatedAt: now
  });

  await input.runtime.repositories.updateScheduleExecution({
    id: input.execution.id,
    runId: run.id,
    status: "running",
    outputText: null,
    error: null,
    updatedAt: input.runtime.now()
  });

  try {
    const result = await executeCommand({
      runId: run.id,
      ownerTgUserId: input.schedule.ownerTgUserId,
      text: input.schedule.commandText,
      runtime: input.runtime
    });
    await recordScheduleToolCall({
      runtime: input.runtime,
      runId: run.id,
      ownerTgUserId: input.schedule.ownerTgUserId,
      result
    });
    await input.runtime.telegramClient.sendMessage({
      chatId: input.schedule.ownerTgUserId,
      text: result.responseText
    });
    await input.runtime.repositories.updateRun(run.id, {
      status: "succeeded",
      responseText: result.responseText,
      error: null,
      updatedAt: input.runtime.now()
    });
    await input.runtime.repositories.updateScheduleExecution({
      id: input.execution.id,
      runId: run.id,
      status: "succeeded",
      outputText: result.responseText,
      error: null,
      updatedAt: input.runtime.now()
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedule execution failed";
    await input.runtime.repositories.recordToolCall({
      id: input.runtime.generateId(),
      runId: run.id,
      ownerTgUserId: input.schedule.ownerTgUserId,
      toolName: "schedule_command",
      riskLevel: "read",
      status: "failed",
      inputJson: JSON.stringify({ commandText: input.schedule.commandText }),
      outputJson: null,
      error: message,
      createdAt: input.runtime.now()
    });
    await input.runtime.repositories.updateRun(run.id, {
      status: "failed",
      responseText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
    await input.runtime.repositories.updateScheduleExecution({
      id: input.execution.id,
      runId: run.id,
      status: "failed",
      outputText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
  }
}

export async function pollDueSchedules(input: {
  runtime: BotRuntime;
  now: number;
  limit?: number;
}): Promise<{ checked: number; started: number }> {
  const schedules = await input.runtime.repositories.listDueSchedules(
    input.now,
    input.limit ?? 20
  );
  let started = 0;

  for (const schedule of schedules) {
    const execution = await input.runtime.repositories.createScheduleExecution({
      id: input.runtime.generateId(),
      scheduleId: schedule.id,
      ownerTgUserId: schedule.ownerTgUserId,
      runId: null,
      scheduledFor: schedule.nextRunAt,
      status: "running",
      outputText: null,
      error: null,
      createdAt: input.runtime.now(),
      updatedAt: input.runtime.now()
    });

    if (!execution) {
      continue;
    }

    started += 1;
    await executeScheduleCommand({
      schedule,
      execution,
      runtime: input.runtime
    });

    const nextRunAt = nextScheduleRunAt({
      cadence: schedule.cadence,
      timeOfDay: schedule.timeOfDay,
      daysOfWeek: schedule.daysOfWeek,
      after: Math.max(input.now, schedule.nextRunAt)
    });
    await input.runtime.repositories.markScheduleExecuted({
      id: schedule.id,
      lastRunAt: schedule.nextRunAt,
      nextRunAt,
      updatedAt: input.runtime.now()
    });
  }

  return { checked: schedules.length, started };
}
