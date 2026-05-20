import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { createApprovalRequest } from "../src/db/approvals.js";
import { saveMemory } from "../src/db/memories.js";
import { approvalRequests, memories, toolCalls } from "../src/db/schema.js";
import { handleUserTextMessage } from "../src/services/messageHandler.js";
import { executeRegisteredTool } from "../src/tools/registry.js";

const userId = "approval-test-user";
const chatId = "approval-test-chat";

async function createMemory(content = "待删除记忆") {
  return saveMemory({
    userId,
    type: "note",
    content,
    confidence: 80,
    importance: 70,
    source: "unit-test",
    sourceRunId: null,
    reason: null
  });
}

async function pendingDeleteApproval(input: {
  memoryId: number;
  approvalCode?: string;
  expiresAt?: Date;
}) {
  return createApprovalRequest({
    userId,
    chatId,
    runId: null,
    toolName: "delete_memory",
    toolArgsJson: JSON.stringify({
      id: input.memoryId,
      reason: "unit approval test"
    }),
    summary: `delete memory ${input.memoryId}`,
    riskLevel: "destructive",
    expiresAt: input.expiresAt ?? null,
    operationSummaryJson: JSON.stringify({
      summary: `delete memory ${input.memoryId}`,
      operationPreview: {
        operation: "delete_memory",
        id: input.memoryId
      }
    }),
    approvalCode: input.approvalCode ?? "1234",
    executedToolCallId: null
  });
}

async function handle(input: string) {
  return handleUserTextMessage({
    input,
    userId,
    chatId,
    metadata: {
      source: "unit-test"
    }
  });
}

describe("approval flow", () => {
  it("creates approval_request for destructive tool calls", async () => {
    const memory = await createMemory();

    const result = await executeRegisteredTool({
      toolName: "delete_memory",
      argsJson: JSON.stringify({
        id: memory.id,
        reason: "unit approval test"
      }),
      context: {
        userId,
        chatId,
        runId: null
      }
    });

    expect(result).toMatchObject({
      approvalRequestCreated: true,
      approvalCodeRequired: true,
      requiresUserReply: true
    });

    const approvals = await db.select().from(approvalRequests);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      toolName: "delete_memory",
      status: "pending",
      riskLevel: "destructive"
    });
  });

  it("does not execute confirmation without required code", async () => {
    const memory = await createMemory();
    await pendingDeleteApproval({ memoryId: memory.id, approvalCode: "1234" });

    const result = await handle("确认");

    expect(result.output).toContain("需要确认码");
    expect(await db.select().from(memories)).toHaveLength(1);
    expect(await db.select().from(toolCalls)).toHaveLength(0);
    expect((await db.select().from(approvalRequests))[0]?.status).toBe("pending");
  });

  it("does not execute confirmation with wrong code", async () => {
    const memory = await createMemory();
    await pendingDeleteApproval({ memoryId: memory.id, approvalCode: "1234" });

    const result = await handle("确认 9999");

    expect(result.output).toContain("确认码不正确");
    expect(await db.select().from(memories)).toHaveLength(1);
    expect(await db.select().from(toolCalls)).toHaveLength(0);
    expect((await db.select().from(approvalRequests))[0]?.status).toBe("pending");
  });

  it("executes confirmation with correct code", async () => {
    const memory = await createMemory("确认后删除");
    await pendingDeleteApproval({ memoryId: memory.id, approvalCode: "1234" });

    const result = await handle("确认 1234");

    expect(result.output).toContain("已删除记忆");
    const rows = await db.select().from(memories);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("deleted");
    expect(await db.select().from(toolCalls)).toHaveLength(1);
    expect((await db.select().from(approvalRequests))[0]?.status).toBe("executed");
  });

  it("rejects pending approval on cancel", async () => {
    const memory = await createMemory();
    await pendingDeleteApproval({ memoryId: memory.id, approvalCode: "1234" });

    const result = await handle("取消");

    expect(result.output).toContain("已取消");
    expect(await db.select().from(memories)).toHaveLength(1);
    expect((await db.select().from(approvalRequests))[0]?.status).toBe("rejected");
  });

  it("does not execute expired approval", async () => {
    const memory = await createMemory();
    await pendingDeleteApproval({
      memoryId: memory.id,
      approvalCode: "1234",
      expiresAt: new Date(Date.now() - 1_000)
    });

    const result = await handle("确认 1234");

    expect(result.output).toContain("已过期");
    expect(await db.select().from(memories)).toHaveLength(1);
    expect(await db.select().from(toolCalls)).toHaveLength(0);
    expect((await db.select().from(approvalRequests))[0]?.status).toBe("expired");
  });

  it("reports no pending approval when none exists", async () => {
    const result = await handle("确认 1234");

    expect(result.output).toBe("当前没有待确认的操作。");
    expect(
      await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.userId, userId))
    ).toHaveLength(0);
  });
});
