import {
  getApprovalRequests,
  getDocumentChunks,
  getDocuments,
  getEvalRunDetail,
  getEvalRuns,
  getMemories,
  getRunDetail,
  getRuns,
  getToolCalls,
  getWorkflowDetail,
  getWorkflows
} from "../db/admin.js";
import {
  serializeApprovalRequest,
  serializeDocument,
  serializeDocumentChunk,
  serializeEvalResult,
  serializeEvalRun,
  serializeRun,
  serializeToolCall,
  serializeWorkflow,
  serializeWorkflowStep
} from "./serializers.js";

export function parseLimit(
  value: string | undefined,
  defaultValue: number
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

export function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export function parseOptionalId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  return parseId(value) ?? undefined;
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

export async function listRunsForAdmin(input: {
  userId?: string;
  status?: string;
  limit: number;
}) {
  const runs = await getRuns(input);

  return runs.map((run) => serializeRun(run));
}

export async function getRunDetailForAdmin(id: number) {
  const detail = await getRunDetail(id);

  if (!detail) {
    return null;
  }

  const run = serializeRun(detail.run);
  const workflowByRun = detail.workflows[0] ?? null;
  const workflowId = workflowByRun ? workflowByRun.id : getWorkflowIdFromRun(run);
  const workflowDetail = workflowId ? await getWorkflowDetail(workflowId) : null;

  return {
    run,
    toolCalls: detail.toolCalls.map((toolCall) => serializeToolCall(toolCall)),
    approvalRequests: detail.approvalRequests.map((approval) =>
      serializeApprovalRequest(approval)
    ),
    workflow: workflowDetail
      ? serializeWorkflow(workflowDetail.workflow)
      : null,
    workflowSteps: workflowDetail
      ? workflowDetail.steps.map((step) => serializeWorkflowStep(step))
      : []
  };
}

export async function listToolCallsForAdmin(input: {
  runId?: number;
  userId?: string;
  toolName?: string;
  status?: string;
  limit: number;
}) {
  const toolCalls = await getToolCalls(input);

  return toolCalls.map((toolCall) => serializeToolCall(toolCall));
}

export async function listWorkflowsForAdmin(input: {
  runId?: number;
  userId?: string;
  status?: string;
  type?: string;
  limit: number;
}) {
  const workflows = await getWorkflows(input);

  return workflows.map((workflow) => serializeWorkflow(workflow));
}

export async function getWorkflowDetailForAdmin(id: number) {
  const detail = await getWorkflowDetail(id);

  if (!detail) {
    return null;
  }

  return {
    workflow: serializeWorkflow(detail.workflow),
    steps: detail.steps.map((step) => serializeWorkflowStep(step))
  };
}

export async function listDocumentsForAdmin(input: {
  userId?: string;
  limit: number;
}) {
  const documents = await getDocuments(input);

  return documents.map((document) => serializeDocument(document));
}

export async function listDocumentChunksForAdmin(input: {
  documentId: number;
  userId?: string;
}) {
  const chunks = await getDocumentChunks(input);

  return chunks.map((chunk) =>
    serializeDocumentChunk(chunk as unknown as Record<string, unknown>)
  );
}

export async function listMemoriesForAdmin(input: {
  userId?: string;
  type?: string;
  limit: number;
}) {
  return getMemories(input);
}

export async function listApprovalRequestsForAdmin(input: {
  runId?: number;
  userId?: string;
  status?: string;
  limit: number;
}) {
  const approvals = await getApprovalRequests(input);

  return approvals.map((approval) => serializeApprovalRequest(approval));
}

export async function listEvalRunsForAdmin(input: { limit: number }) {
  const evalRuns = await getEvalRuns(input);

  return evalRuns.map((evalRun) => serializeEvalRun(evalRun));
}

export async function getEvalRunDetailForAdmin(id: number) {
  const detail = await getEvalRunDetail(id);

  if (!detail) {
    return null;
  }

  return {
    evalRun: serializeEvalRun(detail.evalRun),
    results: detail.results.map((result) => serializeEvalResult(result))
  };
}
