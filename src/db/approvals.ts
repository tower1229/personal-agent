import { randomInt } from "node:crypto";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "./client.js";
import {
  approvalRequests,
  type ApprovalRequest,
  type NewApprovalRequest
} from "./schema.js";

const defaultApprovalTtlMs = 10 * 60 * 1000;

export function generateApprovalCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

export async function createApprovalRequest(
  request: Omit<
    NewApprovalRequest,
    "status" | "createdAt" | "decidedAt" | "executedAt"
  >
): Promise<ApprovalRequest> {
  const now = new Date();

  const created = await db
    .insert(approvalRequests)
    .values({
      ...request,
      expiresAt:
        request.expiresAt ?? new Date(now.getTime() + defaultApprovalTtlMs),
      approvalCode: request.approvalCode ?? generateApprovalCode(),
      executionError: request.executionError ?? null,
      executionAttempts: request.executionAttempts ?? 0,
      status: "pending",
      createdAt: now,
      decidedAt: null,
      executedAt: null,
      executedToolCallId: request.executedToolCallId ?? null
    })
    .returning();

  const approval = created[0];

  if (!approval) {
    throw new Error("Failed to create approval request");
  }

  return approval;
}

export async function findPendingApprovalByCode(input: {
  userId: string;
  chatId: string;
  code: string;
}): Promise<ApprovalRequest | null> {
  const approvals = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.approvalCode, input.code),
        eq(approvalRequests.status, "pending"),
        gt(approvalRequests.expiresAt, new Date())
      )
    )
    .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.id))
    .limit(1);

  return approvals[0] ?? null;
}

export async function getLatestApprovalForUserByCode(input: {
  userId: string;
  chatId: string;
  code: string;
}): Promise<ApprovalRequest | null> {
  const approvals = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.approvalCode, input.code)
      )
    )
    .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.id))
    .limit(1);

  return approvals[0] ?? null;
}

export async function getLatestPendingApprovalForUser(input: {
  userId: string;
  chatId: string;
}): Promise<ApprovalRequest | null> {
  const approvals = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.status, "pending")
      )
    )
    .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.id))
    .limit(1);

  return approvals[0] ?? null;
}

export async function getLatestApprovalForUser(input: {
  userId: string;
  chatId: string;
}): Promise<ApprovalRequest | null> {
  const approvals = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId)
      )
    )
    .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.id))
    .limit(1);

  return approvals[0] ?? null;
}

export async function markApprovalExecuting(input: {
  id: number;
  userId: string;
  chatId: string;
  code: string;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "executing",
      decidedAt: new Date(),
      executionError: null,
      executionAttempts: 1
    })
    .where(
      and(
        eq(approvalRequests.id, input.id),
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.approvalCode, input.code),
        eq(approvalRequests.status, "pending"),
        gt(approvalRequests.expiresAt, new Date())
      )
    )
    .returning();

  const approval = updated[0];

  if (!approval) {
    throw new Error("Pending approval request was not found or is no longer executable");
  }

  return approval;
}

export async function rejectRequest(input: {
  id: number;
  userId: string;
  chatId: string;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "rejected",
      decidedAt: new Date()
    })
    .where(
      and(
        eq(approvalRequests.id, input.id),
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning();

  const approval = updated[0];

  if (!approval) {
    throw new Error("Pending approval request was not found");
  }

  return approval;
}

export async function markApprovalExecuted(input: {
  id: number;
  executedToolCallId?: number | null;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "executed",
      executedAt: new Date(),
      executionError: null,
      executedToolCallId: input.executedToolCallId ?? null
    })
    .where(
      and(
        eq(approvalRequests.id, input.id),
        eq(approvalRequests.status, "executing")
      )
    )
    .returning();

  const approval = updated[0];

  if (!approval) {
    throw new Error("Executing approval request was not found");
  }

  return approval;
}

export async function markApprovalExecutionFailed(input: {
  id: number;
  error: string;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "execution_failed",
      executedAt: new Date(),
      executionError: input.error
    })
    .where(
      and(
        eq(approvalRequests.id, input.id),
        eq(approvalRequests.status, "executing")
      )
    )
    .returning();

  const approval = updated[0];

  if (!approval) {
    throw new Error("Executing approval request was not found");
  }

  return approval;
}

export async function expireOldApprovals(): Promise<void> {
  await db
    .update(approvalRequests)
    .set({
      status: "expired",
      decidedAt: new Date()
    })
    .where(
      and(
        eq(approvalRequests.status, "pending"),
        lte(approvalRequests.expiresAt, new Date())
      )
    );
}
