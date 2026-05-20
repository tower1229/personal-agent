import { Hono } from "hono";
import {
  getEvalRunDetailForAdmin,
  getMemoryDetailForAdmin,
  getRunDetailForAdmin,
  getWorkflowDetailForAdmin,
  listApprovalRequestsForAdmin,
  listDocumentChunksForAdmin,
  listDocumentsForAdmin,
  listEvalRunsForAdmin,
  listMemoriesForAdmin,
  listRunsForAdmin,
  listToolCallsForAdmin,
  listWorkflowsForAdmin,
  parseId,
  parseLimit,
  parseOptionalId
} from "./data.js";
import {
  renderApprovalsPage,
  renderDashboardPage,
  renderDocumentChunksPage,
  renderDocumentsPage,
  renderEvalDetailPage,
  renderEvalRunsPage,
  renderMessagePage,
  renderMemoriesPage,
  renderMemoryDetailPage,
  renderRunDetailPage,
  renderRunsPage,
  renderWorkflowDetailPage,
  renderWorkflowsPage
} from "./ui/pages.js";

export const adminRoutes = new Hono();

adminRoutes.get("/health", (c) => c.json({ ok: true }));

adminRoutes.get("/runs", async (c) => {
  const runs = await listRunsForAdmin({
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    q: c.req.query("q"),
    limit: parseLimit(c.req.query("limit"), 20)
  });

  return c.json({
    runs
  });
});

adminRoutes.get("/runs/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.json({ error: "Invalid run id" }, 400);
  }

  const detail = await getRunDetailForAdmin(id);

  if (!detail) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({
    run: detail.run,
    toolCalls: detail.toolCalls,
    approvalRequests: detail.approvalRequests,
    workflow: detail.workflow,
    workflowSteps: detail.workflowSteps
  });
});

adminRoutes.get("/tool-calls", async (c) => {
  const toolCalls = await listToolCallsForAdmin({
    runId: parseOptionalId(c.req.query("runId")),
    userId: c.req.query("userId"),
    toolName: c.req.query("toolName"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    toolCalls
  });
});

adminRoutes.get("/workflows", async (c) => {
  const workflows = await listWorkflowsForAdmin({
    runId: parseOptionalId(c.req.query("runId")),
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    type: c.req.query("type"),
    limit: parseLimit(c.req.query("limit"), 20)
  });

  return c.json({
    workflows
  });
});

adminRoutes.get("/workflows/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.json({ error: "Invalid workflow id" }, 400);
  }

  const detail = await getWorkflowDetailForAdmin(id);

  if (!detail) {
    return c.json({ error: "Workflow not found" }, 404);
  }

  return c.json({
    workflow: detail.workflow,
    steps: detail.steps
  });
});

adminRoutes.get("/documents", async (c) => {
  const documents = await listDocumentsForAdmin({
    userId: c.req.query("userId"),
    title: c.req.query("title"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    documents
  });
});

adminRoutes.get("/documents/:id/chunks", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.json({ error: "Invalid document id" }, 400);
  }

  const chunks = await listDocumentChunksForAdmin({
    documentId: id,
    userId: c.req.query("userId")
  });

  return c.json({
    chunks
  });
});

adminRoutes.get("/memories", async (c) => {
  const memories = await listMemoriesForAdmin({
    userId: c.req.query("userId"),
    type: c.req.query("type"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    memories
  });
});

adminRoutes.get("/approvals", async (c) => {
  const approvals = await listApprovalRequestsForAdmin({
    runId: parseOptionalId(c.req.query("runId")),
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    riskLevel: c.req.query("riskLevel"),
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.json({
    approvals
  });
});

adminRoutes.get("/ui", (c) => c.html(renderDashboardPage()));

adminRoutes.get("/ui/runs", async (c) => {
  const filters = {
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    q: c.req.query("q"),
    limit: parseLimit(c.req.query("limit"), 50)
  };
  const runs = await listRunsForAdmin(filters);

  return c.html(renderRunsPage(runs, filters));
});

adminRoutes.get("/ui/runs/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.html(renderMessagePage("Invalid run id", "Run id must be a positive integer."), 400);
  }

  const detail = await getRunDetailForAdmin(id);

  if (!detail) {
    return c.html(renderMessagePage("Run not found", `Run ${id} was not found.`), 404);
  }

  return c.html(renderRunDetailPage(detail));
});

adminRoutes.get("/ui/workflows", async (c) => {
  const filters = {
    runId: parseOptionalId(c.req.query("runId")),
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    type: c.req.query("type"),
    limit: parseLimit(c.req.query("limit"), 50)
  };
  const workflows = await listWorkflowsForAdmin(filters);

  return c.html(renderWorkflowsPage(workflows, filters));
});

adminRoutes.get("/ui/workflows/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.html(
      renderMessagePage("Invalid workflow id", "Workflow id must be a positive integer."),
      400
    );
  }

  const detail = await getWorkflowDetailForAdmin(id);

  if (!detail) {
    return c.html(renderMessagePage("Workflow not found", `Workflow ${id} was not found.`), 404);
  }

  return c.html(renderWorkflowDetailPage(detail));
});

adminRoutes.get("/ui/approvals", async (c) => {
  const filters = {
    runId: parseOptionalId(c.req.query("runId")),
    userId: c.req.query("userId"),
    status: c.req.query("status"),
    riskLevel: c.req.query("riskLevel"),
    limit: parseLimit(c.req.query("limit"), 100)
  };
  const approvals = await listApprovalRequestsForAdmin(filters);

  return c.html(renderApprovalsPage(approvals, filters));
});

adminRoutes.get("/ui/documents", async (c) => {
  const filters = {
    userId: c.req.query("userId"),
    title: c.req.query("title"),
    limit: parseLimit(c.req.query("limit"), 100)
  };
  const documents = await listDocumentsForAdmin(filters);

  return c.html(renderDocumentsPage(documents, filters));
});

adminRoutes.get("/ui/documents/:id/chunks", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.html(
      renderMessagePage("Invalid document id", "Document id must be a positive integer."),
      400
    );
  }

  const chunks = await listDocumentChunksForAdmin({
    documentId: id
  });

  return c.html(renderDocumentChunksPage(id, chunks));
});

adminRoutes.get("/ui/memories", async (c) => {
  const filters = {
    userId: c.req.query("userId"),
    type: c.req.query("type"),
    status: c.req.query("status"),
    limit: parseLimit(c.req.query("limit"), 100)
  };
  const memories = await listMemoriesForAdmin(filters);

  return c.html(renderMemoriesPage(memories, filters));
});

adminRoutes.get("/ui/memories/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.html(
      renderMessagePage("Invalid memory id", "Memory id must be a positive integer."),
      400
    );
  }

  const detail = await getMemoryDetailForAdmin(id);

  if (!detail) {
    return c.html(renderMessagePage("Memory not found", `Memory ${id} was not found.`), 404);
  }

  return c.html(renderMemoryDetailPage(detail));
});

adminRoutes.get("/ui/evals", async (c) => {
  const evalRuns = await listEvalRunsForAdmin({
    limit: parseLimit(c.req.query("limit"), 50)
  });

  return c.html(renderEvalRunsPage(evalRuns));
});

adminRoutes.get("/ui/evals/:id", async (c) => {
  const id = parseId(c.req.param("id"));

  if (!id) {
    return c.html(renderMessagePage("Invalid eval id", "Eval id must be a positive integer."), 400);
  }

  const detail = await getEvalRunDetailForAdmin(id);

  if (!detail) {
    return c.html(renderMessagePage("Eval not found", `Eval ${id} was not found.`), 404);
  }

  return c.html(renderEvalDetailPage(detail));
});
