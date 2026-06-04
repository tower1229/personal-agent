import {
  type ApprovalRequestRecord,
  type LongTaskEventRecord,
  type LongTaskRecord,
  type LongTaskStepRecord,
  type MemoryRecord,
  type PersonalModelClaimRecord,
  type PersonalModelEvidenceRecord,
  type PersonalModelEventRecord,
  type PersonalModelMetacognitionLogRecord,
  type PersonalModelUnderstandingGapRecord,
  type PersonalModelSourceChunkRecord,
  type PersonalModelSourceDocumentRecord,
  type PlannerRouteDecisionRecord,
  type RunRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type TodoRecord,
  type ToolCallRecord
} from "../repositories.js";

export function toAdminRun(run: RunRecord) {
  return {
    id: run.id,
    sessionId: run.sessionId ?? null,
    status: run.status,
    messageText: run.messageText,
    responseText: run.responseText,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

export function toAdminToolCall(toolCall: ToolCallRecord) {
  return {
    id: toolCall.id,
    runId: toolCall.runId,
    toolName: toolCall.toolName,
    riskLevel: toolCall.riskLevel,
    status: toolCall.status,
    inputJson: toolCall.inputJson,
    outputJson: toolCall.outputJson,
    error: toolCall.error,
    createdAt: toolCall.createdAt
  };
}

export function toAdminTodo(todo: TodoRecord) {
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    createdAt: todo.createdAt,
    completedAt: todo.completedAt,
    dueAt: todo.dueAt,
    remindedAt: todo.remindedAt
  };
}

export function toAdminMemory(memory: MemoryRecord) {
  return {
    id: memory.id,
    content: memory.content,
    status: memory.status,
    createdAt: memory.createdAt,
    deletedAt: memory.deletedAt
  };
}

export function toAdminApproval(approval: ApprovalRequestRecord) {
  return {
    id: approval.id,
    action: approval.action,
    status: approval.status,
    code: approval.code,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt
  };
}

export function toAdminPersonalModelClaim(claim: PersonalModelClaimRecord) {
  return {
    id: claim.id,
    claim: claim.claim,
    layer: claim.layer,
    scenario: claim.scenario,
    confidence: claim.confidence,
    status: claim.status,
    usagePolicy: claim.usagePolicy,
    sensitivity: claim.sensitivity,
    validFrom: claim.validFrom,
    validUntil: claim.validUntil,
    lastConfirmedAt: claim.lastConfirmedAt,
    metadataJson: claim.metadataJson,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt
  };
}

export function toAdminPersonalModelEvent(event: PersonalModelEventRecord) {
  return {
    id: event.id,
    claimId: event.claimId,
    eventType: event.eventType,
    payloadJson: event.payloadJson,
    createdAt: event.createdAt
  };
}

export function toAdminPersonalModelSourceDocument(
  source: PersonalModelSourceDocumentRecord
) {
  return {
    id: source.id,
    sourceType: source.sourceType,
    title: source.title,
    uri: source.uri,
    content: source.content,
    status: source.status,
    usagePolicy: source.usagePolicy,
    sensitivity: source.sensitivity,
    sourceCreatedAt: source.sourceCreatedAt,
    sourceUpdatedAt: source.sourceUpdatedAt,
    ingestedAt: source.ingestedAt,
    metadataJson: source.metadataJson
  };
}

export function toAdminPersonalModelSourceChunk(
  chunk: PersonalModelSourceChunkRecord
) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    metadataJson: chunk.metadataJson,
    createdAt: chunk.createdAt
  };
}

export function toAdminPersonalModelEvidence(
  evidence: PersonalModelEvidenceRecord
) {
  return {
    id: evidence.id,
    claimId: evidence.claimId,
    evidenceType: evidence.evidenceType,
    sourceDocumentId: evidence.sourceDocumentId,
    sourceChunkId: evidence.sourceChunkId,
    runId: evidence.runId,
    quote: evidence.quote,
    weight: evidence.weight,
    createdAt: evidence.createdAt
  };
}

export function toAdminPersonalModelMetacognitionLog(
  log: PersonalModelMetacognitionLogRecord
) {
  return {
    id: log.id,
    relatedClaimId: log.relatedClaimId,
    relatedGapId: log.relatedGapId,
    reflectionType: log.reflectionType,
    content: log.content,
    createdAt: log.createdAt
  };
}

export function toAdminPersonalModelUnderstandingGap(
  gap: PersonalModelUnderstandingGapRecord
) {
  return {
    id: gap.id,
    scenario: gap.scenario,
    gapDescription: gap.gapDescription,
    status: gap.status,
    createdAt: gap.createdAt,
    updatedAt: gap.updatedAt
  };
}

export function toAdminSkill(skill: SkillRecord) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    deleted: skill.deletedAt !== null,
    publishedVersionId: skill.publishedVersionId,
    updatedAt: skill.updatedAt,
    validation: skill.draftValidation
  };
}

export function toAdminSkillDetail(skill: SkillRecord) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    files: skill.draftFiles,
    metadata: skill.draftMetadata,
    body: skill.draftBody,
    fileInventory: skill.draftFileInventory,
    validation: skill.draftValidation,
    enabled: skill.enabled,
    deleted: skill.deletedAt !== null,
    publishedVersionId: skill.publishedVersionId,
    publishedVersion: skill.publishedVersion,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt
  };
}

export function toAdminSkillRun(skillRun: SkillRunRecord) {
  return {
    id: skillRun.id,
    runId: skillRun.runId,
    skillId: skillRun.skillId,
    skillVersionId: skillRun.skillVersionId,
    status: skillRun.status,
    inputText: skillRun.inputText,
    outputText: skillRun.outputText,
    error: skillRun.error,
    createdAt: skillRun.createdAt,
    updatedAt: skillRun.updatedAt
  };
}

export function toAdminSkillRouteDecision(decision: SkillRouteDecisionRecord) {
  return {
    id: decision.id,
    runId: decision.runId,
    triggerType: decision.triggerType,
    matchedSkillId: decision.matchedSkillId,
    matchedSkillName: decision.matchedSkillName,
    matchedSkillVersionId: decision.matchedSkillVersionId,
    confidence: decision.confidence,
    inputText: decision.inputText,
    reason: decision.reason,
    candidatesJson: decision.candidatesJson,
    createdAt: decision.createdAt
  };
}

export function toAdminPlannerRouteDecision(
  decision: PlannerRouteDecisionRecord
) {
  return {
    id: decision.id,
    runId: decision.runId,
    policyVersion: decision.policyVersion,
    inputTextRedacted: decision.inputTextRedacted,
    inputHash: decision.inputHash,
    mode: decision.mode,
    confidence: decision.confidence,
    reason: decision.reason,
    candidateTools: decision.candidateTools,
    toolActionRisk: decision.toolActionRisk,
    freshnessRisk: decision.freshnessRisk,
    privacyRisk: decision.privacyRisk,
    confirmationRequired: decision.confirmationRequired,
    searchPolicy: decision.searchPolicy,
    fetchPolicy: decision.fetchPolicy,
    signals: decision.signals,
    classifierUsed: decision.classifierUsed,
    question: decision.question,
    createdAt: decision.createdAt
  };
}

export function toAdminLongTask(task: LongTaskRecord) {
  return {
    id: task.id,
    runId: task.runId,
    title: task.title,
    originalInput: task.originalInput,
    status: task.status,
    complexityScore: task.complexityScore,
    plannerReason: task.plannerReason,
    currentStepId: task.currentStepId,
    outputText: task.outputText,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

export function toAdminLongTaskStep(step: LongTaskStepRecord) {
  return {
    id: step.id,
    longTaskId: step.longTaskId,
    position: step.position,
    title: step.title,
    description: step.description,
    status: step.status,
    toolPolicy: step.toolPolicy,
    successCriteria: step.successCriteria,
    inputJson: step.inputJson,
    outputJson: step.outputJson,
    error: step.error,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    createdAt: step.createdAt
  };
}

export function toAdminLongTaskEvent(event: LongTaskEventRecord) {
  return {
    id: event.id,
    longTaskId: event.longTaskId,
    stepId: event.stepId,
    eventType: event.eventType,
    payloadJson: event.payloadJson,
    createdAt: event.createdAt
  };
}

export function toAdminSchedule(schedule: ScheduleRecord) {
  return {
    id: schedule.id,
    name: schedule.name,
    commandText: schedule.commandText,
    enabled: schedule.enabled,
    timezone: schedule.timezone,
    cadence: schedule.cadence,
    timeOfDay: schedule.timeOfDay,
    daysOfWeek: schedule.daysOfWeek,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

export function toAdminScheduleExecution(execution: ScheduleExecutionRecord) {
  return {
    id: execution.id,
    scheduleId: execution.scheduleId,
    runId: execution.runId,
    scheduledFor: execution.scheduledFor,
    status: execution.status,
    outputText: execution.outputText,
    error: execution.error,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt
  };
}
