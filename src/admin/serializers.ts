import { parseJsonOrValue } from "../utils/json.js";

export function serializeRun(run: Record<string, unknown>) {
  return {
    ...run,
    metadataJson: parseJsonOrValue(run.metadataJson as string | null)
  };
}

export function serializeToolCall(toolCall: Record<string, unknown>) {
  return {
    ...toolCall,
    argsJson: parseJsonOrValue(toolCall.argsJson as string | null),
    resultJson: parseJsonOrValue(toolCall.resultJson as string | null)
  };
}

export function serializeWorkflow(workflow: Record<string, unknown>) {
  return {
    ...workflow,
    inputJson: parseJsonOrValue(workflow.inputJson as string | null),
    outputJson: parseJsonOrValue(workflow.outputJson as string | null)
  };
}

export function serializeWorkflowStep(step: Record<string, unknown>) {
  return {
    ...step,
    inputJson: parseJsonOrValue(step.inputJson as string | null),
    outputJson: parseJsonOrValue(step.outputJson as string | null)
  };
}

export function serializeApprovalRequest(approval: Record<string, unknown>) {
  return {
    ...approval,
    toolArgsJson: parseJsonOrValue(approval.toolArgsJson as string | null),
    operationSummary: parseJsonOrValue(
      approval.operationSummaryJson as string | null
    )
  };
}

export function serializeDocument(document: Record<string, unknown>) {
  return document;
}

export function serializeDocumentChunk(chunk: Record<string, unknown>) {
  return {
    ...chunk,
    metadataJson: parseJsonOrValue(chunk.metadataJson as string | null)
  };
}

export function serializeEvalRun(evalRun: Record<string, unknown>) {
  return evalRun;
}

export function serializeEvalResult(result: Record<string, unknown>) {
  return {
    ...result,
    scoreJson: parseJsonOrValue(result.scoreJson as string | null)
  };
}

export function serializeJob(job: Record<string, unknown>) {
  return {
    ...job,
    payloadJson: parseJsonOrValue(job.payloadJson as string | null)
  };
}
