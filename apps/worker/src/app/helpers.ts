import { adminD1ReadinessResponseSchema } from "@personal-agent/shared";
import { type WorkerEnv } from "../types.js";

const requiredD1Tables = [
  "runs",
  "tool_calls",
  "todos",
  "memories",
  "memory_events",
  "approval_requests",
  "skills",
  "skill_versions",
  "skill_route_decisions",
  "skill_runs",
  "workflow_runs",
  "workflow_steps",
  "schedules",
  "schedule_executions"
] as const;

export function ownerId(env: WorkerEnv): number {
  return Number.parseInt(env.OWNER_TG_USER_ID, 10);
}

export function telegramBotUsername(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^@/, "") ?? "";

  if (
    normalized.length < 5 ||
    normalized.length > 32 ||
    !/^[A-Za-z0-9_]+$/.test(normalized) ||
    !normalized.toLowerCase().endsWith("bot")
  ) {
    return null;
  }

  return normalized;
}

export function defaultGenerateId(): string {
  return crypto.randomUUID();
}

export function defaultGenerateApprovalCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

export function limitParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

export async function checkD1Readiness(db: D1Database, checkedAt: number) {
  const tableRows = await db
    .prepare("select name from sqlite_master where type = 'table'")
    .all<{ name: string }>();
  const present = new Set(
    (tableRows.results ?? []).map((row) => row.name).filter(Boolean)
  );
  const requiredTables = requiredD1Tables.map((name) => ({
    name,
    present: present.has(name)
  }));
  const missingTables = requiredTables
    .filter((table) => !table.present)
    .map((table) => table.name);

  return adminD1ReadinessResponseSchema.parse({
    ok: missingTables.length === 0,
    checkedAt,
    requiredTables,
    missingTables,
    migrationCommand: "npm run d1:migrate:worker:remote"
  });
}
