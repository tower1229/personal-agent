import { and, desc, eq, like, or } from "drizzle-orm";
import { listDocumentChunks } from "./documents.js";
import { db } from "./client.js";
import {
  approvalRequests,
  evalResults,
  evalRuns,
  documents,
  memories,
  memoryEmbeddings,
  memoryEvents,
  runs,
  toolCalls,
  workflows,
  workflowSteps
} from "./schema.js";

function clampLimit(limit: number, max: number): number {
  return Math.min(Math.max(limit, 1), max);
}

export async function getRuns(input: {
  userId?: string;
  status?: string;
  q?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.userId) {
    conditions.push(eq(runs.userId, input.userId));
  }

  if (input.status) {
    conditions.push(
      eq(runs.status, input.status as "running" | "succeeded" | "failed")
    );
  }

  if (input.q) {
    const pattern = `%${input.q}%`;
    conditions.push(or(like(runs.input, pattern), like(runs.output, pattern)));
  }

  let query = db.select().from(runs).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(desc(runs.createdAt)).limit(clampLimit(input.limit, 100));
}

export async function getRunDetail(id: number) {
  const runRows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  const run = runRows[0] ?? null;

  if (!run) {
    return null;
  }

  const relatedToolCalls = await db
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.runId, id))
    .orderBy(desc(toolCalls.createdAt));
  const relatedApprovals = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.runId, id))
    .orderBy(desc(approvalRequests.createdAt));
  const relatedWorkflows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.runId, id))
    .orderBy(desc(workflows.createdAt));

  return {
    run,
    toolCalls: relatedToolCalls,
    approvalRequests: relatedApprovals,
    workflows: relatedWorkflows
  };
}

export async function getToolCalls(input: {
  runId?: number;
  userId?: string;
  toolName?: string;
  status?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.runId) {
    conditions.push(eq(toolCalls.runId, input.runId));
  }

  if (input.userId) {
    conditions.push(eq(toolCalls.userId, input.userId));
  }

  if (input.toolName) {
    conditions.push(eq(toolCalls.toolName, input.toolName));
  }

  if (input.status) {
    conditions.push(
      eq(toolCalls.status, input.status as "succeeded" | "failed")
    );
  }

  let query = db.select().from(toolCalls).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(toolCalls.createdAt))
    .limit(clampLimit(input.limit, 100));
}

export async function getWorkflows(input: {
  runId?: number;
  userId?: string;
  status?: string;
  type?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.runId) {
    conditions.push(eq(workflows.runId, input.runId));
  }

  if (input.userId) {
    conditions.push(eq(workflows.userId, input.userId));
  }

  if (input.status) {
    conditions.push(
      eq(workflows.status, input.status as "running" | "succeeded" | "failed")
    );
  }

  if (input.type) {
    conditions.push(eq(workflows.type, input.type as "daily_brief"));
  }

  let query = db.select().from(workflows).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(workflows.createdAt))
    .limit(clampLimit(input.limit, 100));
}

export async function getWorkflowDetail(id: number) {
  const workflowRows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);
  const workflow = workflowRows[0] ?? null;

  if (!workflow) {
    return null;
  }

  const steps = await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowId, id))
    .orderBy(workflowSteps.id);

  return {
    workflow,
    steps
  };
}

export async function getMemories(input: {
  userId?: string;
  type?: string;
  status?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.userId) {
    conditions.push(eq(memories.userId, input.userId));
  }

  if (input.type) {
    conditions.push(
      eq(
        memories.type,
        input.type as "profile" | "preference" | "fact" | "project" | "note"
      )
    );
  }

  if (input.status) {
    conditions.push(
      eq(memories.status, input.status as "active" | "archived" | "deleted")
    );
  }

  let query = db.select().from(memories).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(memories.updatedAt))
    .limit(clampLimit(input.limit, 100));
}

export async function getMemoryDetail(id: number) {
  const memoryRows = await db
    .select()
    .from(memories)
    .where(eq(memories.id, id))
    .limit(1);
  const memory = memoryRows[0] ?? null;

  if (!memory) {
    return null;
  }

  const events = await db
    .select()
    .from(memoryEvents)
    .where(eq(memoryEvents.memoryId, id))
    .orderBy(desc(memoryEvents.createdAt));
  const embeddings = await db
    .select()
    .from(memoryEmbeddings)
    .where(eq(memoryEmbeddings.memoryId, id))
    .orderBy(desc(memoryEmbeddings.createdAt));

  return {
    memory,
    events,
    embeddings
  };
}

export async function getDocuments(input: {
  userId?: string;
  title?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.userId) {
    conditions.push(eq(documents.userId, input.userId));
  }

  if (input.title) {
    conditions.push(like(documents.title, `%${input.title}%`));
  }

  let query = db.select().from(documents).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(documents.createdAt))
    .limit(clampLimit(input.limit, 100));
}

export async function getDocumentChunks(input: {
  documentId: number;
  userId?: string;
}) {
  return listDocumentChunks(input);
}

export async function getApprovalRequests(input: {
  runId?: number;
  userId?: string;
  status?: string;
  riskLevel?: string;
  limit: number;
}) {
  const conditions = [];

  if (input.runId) {
    conditions.push(eq(approvalRequests.runId, input.runId));
  }

  if (input.userId) {
    conditions.push(eq(approvalRequests.userId, input.userId));
  }

  if (input.status) {
    conditions.push(
      eq(
        approvalRequests.status,
        input.status as
          | "pending"
          | "approved"
          | "rejected"
          | "executed"
          | "expired"
      )
    );
  }

  if (input.riskLevel) {
    conditions.push(eq(approvalRequests.riskLevel, input.riskLevel));
  }

  let query = db.select().from(approvalRequests).$dynamic();

  if (conditions.length) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(approvalRequests.createdAt))
    .limit(clampLimit(input.limit, 100));
}

export async function getEvalRuns(input: { limit: number }) {
  return db
    .select()
    .from(evalRuns)
    .orderBy(desc(evalRuns.startedAt), desc(evalRuns.id))
    .limit(clampLimit(input.limit, 100));
}

export async function getEvalResults(input: { evalRunId: number }) {
  return db
    .select()
    .from(evalResults)
    .where(eq(evalResults.evalRunId, input.evalRunId))
    .orderBy(evalResults.id);
}

export async function getEvalRunDetail(id: number) {
  const evalRunRows = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.id, id))
    .limit(1);
  const evalRun = evalRunRows[0] ?? null;

  if (!evalRun) {
    return null;
  }

  return {
    evalRun,
    results: await getEvalResults({ evalRunId: id })
  };
}
