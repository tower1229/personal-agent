import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, sqlite } from "./client.js";
import { jobs, type Job, type JobType, type NewJob } from "./schema.js";

const defaultMaxAttempts = 3;
const defaultLockTimeoutMs = 5 * 60 * 1000;

export interface CreateJobInput {
  type: JobType;
  userId: string;
  chatId: string;
  runId?: number | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface MarkJobFailedRetryPolicy {
  retryable: boolean;
  delayMs?: number;
}

function backoffDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(attempts - 1, 0));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const now = new Date();
  const values: NewJob = {
    type: input.type,
    status: "pending",
    userId: input.userId,
    chatId: input.chatId,
    runId: input.runId ?? null,
    idempotencyKey: input.idempotencyKey,
    payloadJson: JSON.stringify(input.payload),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? defaultMaxAttempts,
    availableAt: input.availableAt ?? now,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };

  const created = await db
    .insert(jobs)
    .values(values)
    .onConflictDoNothing({
      target: jobs.idempotencyKey
    })
    .returning();

  if (created[0]) {
    return created[0];
  }

  const existing = await db
    .select()
    .from(jobs)
    .where(eq(jobs.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing[0]) {
    throw new Error("Failed to create or load idempotent job");
  }

  return existing[0];
}

export async function claimNextJob(
  workerId: string,
  input: { lockTimeoutMs?: number } = {}
): Promise<Job | null> {
  const nowMs = Date.now();
  const lockExpiredBeforeMs = nowMs - (input.lockTimeoutMs ?? defaultLockTimeoutMs);
  const row = sqlite
    .prepare(
      [
        "UPDATE jobs",
        "SET status = 'running',",
        "    attempts = attempts + 1,",
        "    locked_at = ?,",
        "    locked_by = ?,",
        "    updated_at = ?",
        "WHERE id = (",
        "  SELECT id FROM jobs",
        "  WHERE (",
        "    status = 'pending'",
        "    AND available_at <= ?",
        "  ) OR (",
        "    status = 'running'",
        "    AND locked_at <= ?",
        "    AND attempts < max_attempts",
        "  )",
        "  ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, available_at ASC, id ASC",
        "  LIMIT 1",
        ")",
        "RETURNING id"
      ].join(" ")
    )
    .get(nowMs, workerId, nowMs, nowMs, lockExpiredBeforeMs) as
    | { id: number }
    | undefined;

  if (!row) {
    return null;
  }

  const claimed = await db.select().from(jobs).where(eq(jobs.id, row.id)).limit(1);
  return claimed[0] ?? null;
}

export async function failExpiredRunningJobs(
  input: { lockTimeoutMs?: number } = {}
): Promise<Job[]> {
  const nowMs = Date.now();
  const lockExpiredBeforeMs = nowMs - (input.lockTimeoutMs ?? defaultLockTimeoutMs);
  const rows = sqlite
    .prepare(
      [
        "UPDATE jobs",
        "SET status = 'failed',",
        "    locked_at = NULL,",
        "    locked_by = NULL,",
        "    last_error = 'Job lock expired after max attempts',",
        "    updated_at = ?",
        "WHERE status = 'running'",
        "  AND locked_at <= ?",
        "  AND attempts >= max_attempts",
        "RETURNING id"
      ].join(" ")
    )
    .all(nowMs, lockExpiredBeforeMs) as Array<{ id: number }>;
  const ids = rows.map((row) => row.id);

  if (!ids.length) {
    return [];
  }

  return db.select().from(jobs).where(inArray(jobs.id, ids));
}

export async function markJobSucceeded(id: number): Promise<Job> {
  const now = new Date();
  const updated = await db
    .update(jobs)
    .set({
      status: "succeeded",
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: now
    })
    .where(eq(jobs.id, id))
    .returning();

  if (!updated[0]) {
    throw new Error(`Job ${id} was not found`);
  }

  return updated[0];
}

export async function markJobFailed(
  id: number,
  error: unknown,
  retryPolicy: MarkJobFailedRetryPolicy
): Promise<Job> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  const job = rows[0];

  if (!job) {
    throw new Error(`Job ${id} was not found`);
  }

  const now = new Date();
  const shouldRetry = retryPolicy.retryable && job.attempts < job.maxAttempts;
  const updated = await db
    .update(jobs)
    .set({
      status: shouldRetry ? "pending" : "failed",
      availableAt: shouldRetry
        ? new Date(now.getTime() + (retryPolicy.delayMs ?? backoffDelayMs(job.attempts)))
        : job.availableAt,
      lockedAt: null,
      lockedBy: null,
      lastError: toErrorMessage(error),
      updatedAt: now
    })
    .where(eq(jobs.id, id))
    .returning();

  if (!updated[0]) {
    throw new Error(`Job ${id} was not found`);
  }

  return updated[0];
}

export async function cancelJob(id: number): Promise<Job> {
  const updated = await db
    .update(jobs)
    .set({
      status: "cancelled",
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date()
    })
    .where(eq(jobs.id, id))
    .returning();

  if (!updated[0]) {
    throw new Error(`Job ${id} was not found`);
  }

  return updated[0];
}

export async function getJob(id: number): Promise<Job | null> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listJobs(input: {
  runId?: number;
  userId?: string;
  status?: string;
  type?: string;
  limit: number;
}): Promise<Job[]> {
  let query = db.select().from(jobs).$dynamic();
  const conditions = [];

  if (input.runId) {
    conditions.push(eq(jobs.runId, input.runId));
  }

  if (input.userId) {
    conditions.push(eq(jobs.userId, input.userId));
  }

  if (input.status) {
    conditions.push(eq(jobs.status, input.status as Job["status"]));
  }

  if (input.type) {
    conditions.push(eq(jobs.type, input.type as JobType));
  }

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(jobs.createdAt), asc(jobs.id))
    .limit(Math.min(Math.max(input.limit, 1), 100));
}
