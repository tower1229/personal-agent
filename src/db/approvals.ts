import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "./client.js";
import {
  approvalRequests,
  type ApprovalRequest,
  type NewApprovalRequest
} from "./schema.js";

export async function createApprovalRequest(
  request: Omit<NewApprovalRequest, "status" | "createdAt">
): Promise<ApprovalRequest> {
  const created = await db
    .insert(approvalRequests)
    .values({
      ...request,
      status: "pending",
      createdAt: new Date(),
      decidedAt: null,
      executedAt: null
    })
    .returning();

  const approval = created[0];

  if (!approval) {
    throw new Error("Failed to create approval request");
  }

  return approval;
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

export async function approveRequest(input: {
  id: number;
  userId: string;
  chatId: string;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "approved",
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
  userId: string;
  chatId: string;
}): Promise<ApprovalRequest> {
  const updated = await db
    .update(approvalRequests)
    .set({
      status: "executed",
      executedAt: new Date()
    })
    .where(
      and(
        eq(approvalRequests.id, input.id),
        eq(approvalRequests.userId, input.userId),
        eq(approvalRequests.chatId, input.chatId),
        eq(approvalRequests.status, "approved")
      )
    )
    .returning();

  const approval = updated[0];

  if (!approval) {
    throw new Error("Approved request was not found");
  }

  return approval;
}

export async function expireOldApprovals(input: {
  olderThanMs: number;
}): Promise<void> {
  const cutoff = new Date(Date.now() - input.olderThanMs);

  await db
    .update(approvalRequests)
    .set({
      status: "expired",
      decidedAt: new Date()
    })
    .where(
      and(
        eq(approvalRequests.status, "pending"),
        lt(approvalRequests.createdAt, cutoff)
      )
    );
}
