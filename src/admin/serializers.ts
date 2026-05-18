function parseJson(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function serializeRun(run: Record<string, unknown>) {
  return {
    ...run,
    metadataJson: parseJson(run.metadataJson as string | null)
  };
}

export function serializeToolCall(toolCall: Record<string, unknown>) {
  return {
    ...toolCall,
    argsJson: parseJson(toolCall.argsJson as string | null),
    resultJson: parseJson(toolCall.resultJson as string | null)
  };
}

export function serializeWorkflow(workflow: Record<string, unknown>) {
  return {
    ...workflow,
    inputJson: parseJson(workflow.inputJson as string | null),
    outputJson: parseJson(workflow.outputJson as string | null)
  };
}

export function serializeWorkflowStep(step: Record<string, unknown>) {
  return {
    ...step,
    inputJson: parseJson(step.inputJson as string | null),
    outputJson: parseJson(step.outputJson as string | null)
  };
}

export function serializeApprovalRequest(approval: Record<string, unknown>) {
  return {
    ...approval,
    toolArgsJson: parseJson(approval.toolArgsJson as string | null)
  };
}

export function serializeDocument(document: Record<string, unknown>) {
  return document;
}

export function serializeDocumentChunk(chunk: Record<string, unknown>) {
  return {
    ...chunk,
    metadataJson: parseJson(chunk.metadataJson as string | null)
  };
}
