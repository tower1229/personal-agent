import { and, eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  workflows,
  workflowSteps,
  type Workflow,
  type WorkflowStatus,
  type WorkflowStep,
  type WorkflowType
} from "./schema.js";

export async function createWorkflow(input: {
  userId: string;
  runId: number;
  type: WorkflowType;
  inputJson: string;
}): Promise<Workflow> {
  const now = new Date();
  const created = await db
    .insert(workflows)
    .values({
      userId: input.userId,
      runId: input.runId,
      type: input.type,
      status: "running",
      inputJson: input.inputJson,
      outputJson: null,
      createdAt: now,
      updatedAt: now
    })
    .returning();

  const workflow = created[0];

  if (!workflow) {
    throw new Error("Failed to create workflow");
  }

  return workflow;
}

export async function updateWorkflowStatus(input: {
  id: number;
  userId: string;
  status: WorkflowStatus;
  outputJson: string | null;
}): Promise<Workflow> {
  const updated = await db
    .update(workflows)
    .set({
      status: input.status,
      outputJson: input.outputJson,
      updatedAt: new Date()
    })
    .where(and(eq(workflows.id, input.id), eq(workflows.userId, input.userId)))
    .returning();

  const workflow = updated[0];

  if (!workflow) {
    throw new Error(`Workflow ${input.id} was not found`);
  }

  return workflow;
}

export async function createWorkflowStep(input: {
  workflowId: number;
  stepName: string;
  inputJson?: string | null;
}): Promise<WorkflowStep> {
  const created = await db
    .insert(workflowSteps)
    .values({
      workflowId: input.workflowId,
      stepName: input.stepName,
      status: "running",
      inputJson: input.inputJson ?? null,
      outputJson: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null
    })
    .returning();

  const step = created[0];

  if (!step) {
    throw new Error(`Failed to create workflow step ${input.stepName}`);
  }

  return step;
}

export async function completeWorkflowStep(input: {
  id: number;
  outputJson?: string | null;
}): Promise<WorkflowStep> {
  const updated = await db
    .update(workflowSteps)
    .set({
      status: "succeeded",
      outputJson: input.outputJson ?? null,
      error: null,
      finishedAt: new Date()
    })
    .where(eq(workflowSteps.id, input.id))
    .returning();

  const step = updated[0];

  if (!step) {
    throw new Error(`Workflow step ${input.id} was not found`);
  }

  return step;
}

export async function failWorkflowStep(input: {
  id: number;
  error: string;
  outputJson?: string | null;
}): Promise<WorkflowStep> {
  const updated = await db
    .update(workflowSteps)
    .set({
      status: "failed",
      outputJson: input.outputJson ?? null,
      error: input.error,
      finishedAt: new Date()
    })
    .where(eq(workflowSteps.id, input.id))
    .returning();

  const step = updated[0];

  if (!step) {
    throw new Error(`Workflow step ${input.id} was not found`);
  }

  return step;
}
