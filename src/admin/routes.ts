import { Hono } from "hono";
import {
  getApprovalRequests,
  getMemories,
  getRunDetail,
  getRuns,
  getToolCalls,
  getWorkflowDetail,
  getWorkflows
} from "../db/admin.js";
import {
  serializeApprovalRequest,
  serializeRun,
  serializeToolCall,
  serializeWorkflow,
  serializeWorkflowStep
} from "./serializers.js";

export const adminRoutes = new Hono();

function parseLimit(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function getWorkflowIdFromRun(run: ReturnType<typeof serializeRun>): number | null {
  const metadata = run.metadataJson;

  if (!metadata || typeof metadata !== "object" || !("workflow_id" in metadata)) {
    return null;
  }

  const workflowId = Number(metadata.workflow_id);

  if (Number.isNaN(workflowId) || workflowId < 1) {
    return null;
  }

  return workflowId;
}

adminRoutes.get("/health", (c) => c.json({ ok: true }));

adminRoutes.get("/runs", async (c) => {
  const runs = await getRuns({
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 20)
  });

  return c.json({
    runs: runs.map((run) => serializeRun(run))
  });
});

adminRoutes.get("/runs/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.json({ error: "Invalid run id" }, 400);
  }

  const detail = await getRunDetail(id);

  if (!detail) {
    return c.json({ error: "Run not found" }, 404);
  }

  const run = serializeRun(detail.run);
  const workflowId = getWorkflowIdFromRun(run);
  const workflowDetail = workflowId
    ? await getWorkflowDetail(workflowId)
    : null;

  return c.json({
    run,
    toolCalls: detail.toolCalls.map((toolCall) =>
      serializeToolCall(toolCall)
    ),
    workflow: workflowDetail
      ? serializeWorkflow(workflowDetail.workflow)
      : null,
    workflowSteps: workflowDetail
      ? workflowDetail.steps.map((step) => serializeWorkflowStep(step))
      : []
  });
});

adminRoutes.get("/tool-calls", async (c) => {
  const toolCalls = await getToolCalls({
    userId: c.req.query("userId"),
    toolName: c.req.query("toolName"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    toolCalls: toolCalls.map((toolCall) => serializeToolCall(toolCall))
  });
});

adminRoutes.get("/workflows", async (c) => {
  const workflows = await getWorkflows({
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    type: c.req.query("type"),
    limit: parseLimit(c.req.query("limit"), 20)
  });

  return c.json({
    workflows: workflows.map((workflow) => serializeWorkflow(workflow))
  });
});

adminRoutes.get("/workflows/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.json({ error: "Invalid workflow id" }, 400);
  }

  const detail = await getWorkflowDetail(id);

  if (!detail) {
    return c.json({ error: "Workflow not found" }, 404);
  }

  return c.json({
    workflow: serializeWorkflow(detail.workflow),
    steps: detail.steps.map((step) => serializeWorkflowStep(step))
  });
});

adminRoutes.get("/memories", async (c) => {
  const memories = await getMemories({
    userId: c.req.query("userId"),
    type: c.req.query("type"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    memories
  });
});

adminRoutes.get("/approvals", async (c) => {
  const approvals = await getApprovalRequests({
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    approvals: approvals.map((approval) =>
      serializeApprovalRequest(approval)
    )
  });
});
