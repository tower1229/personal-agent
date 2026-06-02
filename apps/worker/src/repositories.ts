import {
  type ApprovalRequestStatus,
  type LongTaskStatus,
  type LongTaskStepStatus,
  type LongTaskToolPolicy,
  type MemoryStatus,
  type PersonalModelConfidence,
  type PersonalModelEventType,
  type PersonalModelEvidenceType,
  type PersonalModelEvidenceWeight,
  type PersonalModelLayer,
  type PersonalModelScenario,
  type PersonalModelSensitivity,
  type PersonalModelSourceStatus,
  type PersonalModelSourceType,
  type PersonalModelStatus,
  type PersonalModelUsagePolicy,
  type RunStatus,
  type ScheduleCadence,
  type ScheduleExecutionStatus,
  type SkillPackageFileInventoryItem,
  type SkillPackageMetadata,
  type SkillRouteTriggerType,
  type SkillRunStatus,
  type SkillValidationResult,
  type TodoStatus,
  type ToolCallStatus,
  type ToolRiskLevel,
  type MetacognitionReflectionType,
  type UnderstandingGapStatus,
  type RunFeedbackType
} from "@personal-agent/shared";

export interface RunRecord {
  id: string;
  ownerTgUserId: number;
  chatId: number;
  updateId: number | null;
  messageText: string | null;
  status: RunStatus;
  responseText: string | null;
  error: string | null;
  contextTraceJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RunFeedbackRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  feedbackType: RunFeedbackType;
  comment: string | null;
  createdAt: number;
}

export interface RunEvaluationRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  groundednessScore: number;
  oldDataMisuseScore: number;
  adviceFitScore: number;
  emotionalCalibrationScore: number;
  reasoning: string;
  createdAt: number;
}

export interface ToolCallRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  toolName: string;
  riskLevel: ToolRiskLevel;
  status: ToolCallStatus;
  inputJson: string;
  outputJson: string | null;
  error: string | null;
  createdAt: number;
}

export interface TodoRecord {
  id: number;
  ownerTgUserId: number;
  title: string;
  status: TodoStatus;
  createdAt: number;
  completedAt: number | null;
}

export interface MemoryRecord {
  id: number;
  ownerTgUserId: number;
  content: string;
  normalizedContent: string;
  status: MemoryStatus;
  createdAt: number;
  deletedAt: number | null;
}

export interface ApprovalRequestRecord {
  id: string;
  ownerTgUserId: number;
  action: string;
  payloadJson: string;
  status: ApprovalRequestStatus;
  code: string;
  createdAt: number;
  decidedAt: number | null;
}

export interface PersonalModelClaimRecord {
  id: string;
  ownerTgUserId: number;
  claim: string;
  layer: PersonalModelLayer;
  scenario: PersonalModelScenario;
  confidence: PersonalModelConfidence;
  status: PersonalModelStatus;
  usagePolicy: PersonalModelUsagePolicy;
  sensitivity: PersonalModelSensitivity;
  validFrom: number | null;
  validUntil: number | null;
  lastConfirmedAt: number | null;
  metadataJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface PersonalModelEventRecord {
  id: string;
  claimId: string | null;
  ownerTgUserId: number;
  eventType: PersonalModelEventType;
  payloadJson: string;
  createdAt: number;
}

export interface PersonalModelSourceDocumentRecord {
  id: string;
  ownerTgUserId: number;
  sourceType: PersonalModelSourceType;
  title: string;
  uri: string | null;
  content: string;
  normalizedContent: string;
  status: PersonalModelSourceStatus;
  usagePolicy: PersonalModelUsagePolicy;
  sensitivity: PersonalModelSensitivity;
  sourceCreatedAt: number | null;
  sourceUpdatedAt: number | null;
  ingestedAt: number;
  metadataJson: string;
}

export interface PersonalModelSourceChunkRecord {
  id: string;
  documentId: string;
  ownerTgUserId: number;
  chunkIndex: number;
  content: string;
  normalizedContent: string;
  tokenCount: number | null;
  metadataJson: string;
  createdAt: number;
  vectorId: string | null;
  indexedAt: number | null;
  indexStatus: "pending" | "indexed" | "failed";
}

export interface PersonalModelEvidenceRecord {
  id: string;
  claimId: string;
  ownerTgUserId: number;
  evidenceType: PersonalModelEvidenceType;
  sourceDocumentId: string | null;
  sourceChunkId: string | null;
  runId: string | null;
  quote: string | null;
  weight: PersonalModelEvidenceWeight;
  createdAt: number;
}

export interface PersonalModelMetacognitionLogRecord {
  id: string;
  ownerTgUserId: number;
  relatedClaimId: string | null;
  relatedGapId: string | null;
  reflectionType: MetacognitionReflectionType;
  content: string;
  createdAt: number;
}

export interface PersonalModelUnderstandingGapRecord {
  id: string;
  ownerTgUserId: number;
  scenario: PersonalModelScenario;
  gapDescription: string;
  status: UnderstandingGapStatus;
  createdAt: number;
  updatedAt: number;
}


export interface SkillRecord {
  id: string;
  ownerTgUserId: number;
  name: string;
  description: string;
  draftFiles: Record<string, string>;
  draftMetadata: SkillPackageMetadata;
  draftBody: string;
  draftFileInventory: SkillPackageFileInventoryItem[];
  draftValidation: SkillValidationResult;
  draftContentHash: string;
  enabled: boolean;
  deletedAt: number | null;
  publishedVersionId: string | null;
  publishedVersion: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  ownerTgUserId: number;
  version: number;
  name: string;
  description: string;
  files: Record<string, string>;
  metadata: SkillPackageMetadata;
  body: string;
  fileInventory: SkillPackageFileInventoryItem[];
  validation: SkillValidationResult;
  contentHash: string;
  createdAt: number;
}

export interface RunnableSkillRecord {
  skill: SkillRecord;
  version: SkillVersionRecord;
}

export interface SkillRouteDecisionRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  inputText: string;
  triggerType: SkillRouteTriggerType;
  matchedSkillId: string | null;
  matchedSkillName: string | null;
  matchedSkillVersionId: string | null;
  confidence: number | null;
  reason: string;
  candidatesJson: string;
  createdAt: number;
}

export interface SkillRunRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  skillId: string;
  skillVersionId: string;
  status: SkillRunStatus;
  inputText: string;
  outputText: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleRecord {
  id: string;
  ownerTgUserId: number;
  name: string;
  commandText: string;
  enabled: boolean;
  timezone: "Asia/Shanghai";
  cadence: ScheduleCadence;
  timeOfDay: string;
  daysOfWeek: number[];
  nextRunAt: number;
  lastRunAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleExecutionRecord {
  id: string;
  scheduleId: string;
  ownerTgUserId: number;
  runId: string | null;
  scheduledFor: number;
  status: ScheduleExecutionStatus;
  outputText: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LongTaskRecord {
  id: string;
  runId: string;
  ownerTgUserId: number;
  title: string;
  originalInput: string;
  status: LongTaskStatus;
  complexityScore: number;
  plannerReason: string;
  currentStepId: string | null;
  outputText: string | null;
  error: string | null;
  replanCount: number;
  telegramChatId: number | null;
  telegramMessageId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LongTaskStepRecord {
  id: string;
  longTaskId: string;
  ownerTgUserId: number;
  position: number;
  title: string;
  description: string;
  status: LongTaskStepStatus;
  toolPolicy: LongTaskToolPolicy;
  successCriteria: string;
  inputJson: string;
  outputJson: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface LongTaskEventRecord {
  id: string;
  longTaskId: string;
  ownerTgUserId: number;
  stepId: string | null;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

export interface UserProfileRecord {
  id: string;
  name: string;
  birthdayTimestamp: number | null;
  gender: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRepositories {
  createRun(input: Omit<RunRecord, "status" | "responseText" | "error" | "contextTraceJson">): Promise<RunRecord>;
  updateRun(
    id: string,
    patch: {
      status?: RunStatus;
      responseText?: string | null;
      error?: string | null;
      contextTraceJson?: string | null;
      updatedAt: number;
    }
  ): Promise<void>;
  listRuns(ownerTgUserId: number, limit: number): Promise<RunRecord[]>;
  getRun(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<RunRecord | null>;
  recordToolCall(input: ToolCallRecord): Promise<void>;
  listToolCallsForRun(input: {
    ownerTgUserId: number;
    runId: string;
  }): Promise<ToolCallRecord[]>;
  createTodo(input: {
    ownerTgUserId: number;
    title: string;
    createdAt: number;
  }): Promise<TodoRecord>;
  listOpenTodos(ownerTgUserId: number, limit: number): Promise<TodoRecord[]>;
  listTodos(ownerTgUserId: number, limit: number): Promise<TodoRecord[]>;
  completeTodo(input: {
    ownerTgUserId: number;
    id: number;
    completedAt: number;
  }): Promise<TodoRecord | null>;
  createMemory(input: {
    ownerTgUserId: number;
    content: string;
    normalizedContent: string;
    createdAt: number;
  }): Promise<MemoryRecord>;
  searchMemories(input: {
    ownerTgUserId: number;
    keyword: string;
    limit: number;
  }): Promise<MemoryRecord[]>;
  getActiveMemory(input: {
    ownerTgUserId: number;
    id: number;
  }): Promise<MemoryRecord | null>;
  listMemories(ownerTgUserId: number, limit: number): Promise<MemoryRecord[]>;
  markMemoryDeleted(input: {
    ownerTgUserId: number;
    id: number;
    deletedAt: number;
  }): Promise<MemoryRecord | null>;
  recordMemoryEvent(input: {
    memoryId: number;
    ownerTgUserId: number;
    eventType: string;
    payload: unknown;
    createdAt: number;
  }): Promise<void>;
  createApproval(input: ApprovalRequestRecord): Promise<ApprovalRequestRecord>;
  findPendingApprovalByCode(input: {
    ownerTgUserId: number;
    code: string;
  }): Promise<ApprovalRequestRecord | null>;
  updateApprovalStatus(input: {
    id: string;
    status: ApprovalRequestStatus;
    decidedAt: number;
  }): Promise<void>;
  listApprovals(
    ownerTgUserId: number,
    limit: number
  ): Promise<ApprovalRequestRecord[]>;
  createPersonalModelClaim(input: Omit<PersonalModelClaimRecord, "createdAt" | "updatedAt"> & {
    createdAt: number;
    updatedAt: number;
  }): Promise<PersonalModelClaimRecord>;
  updatePersonalModelClaim(input: {
    ownerTgUserId: number;
    id: string;
    patch: Partial<
      Pick<
        PersonalModelClaimRecord,
        | "claim"
        | "layer"
        | "scenario"
        | "confidence"
        | "status"
        | "usagePolicy"
        | "sensitivity"
        | "validFrom"
        | "validUntil"
        | "lastConfirmedAt"
        | "metadataJson"
      >
    >;
    updatedAt: number;
  }): Promise<PersonalModelClaimRecord | null>;
  getPersonalModelClaim(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<PersonalModelClaimRecord | null>;
  listPersonalModelClaims(input: {
    ownerTgUserId: number;
    limit: number;
    status?: PersonalModelStatus;
    scenario?: PersonalModelScenario;
  }): Promise<PersonalModelClaimRecord[]>;
  listActivePersonalModelClaims(input: {
    ownerTgUserId: number;
    limit: number;
    now: number;
  }): Promise<PersonalModelClaimRecord[]>;
  createPersonalModelEvent(
    input: PersonalModelEventRecord
  ): Promise<PersonalModelEventRecord>;
  listPersonalModelEvents(input: {
    ownerTgUserId: number;
    claimId: string;
    limit: number;
  }): Promise<PersonalModelEventRecord[]>;
  createPersonalModelSourceDocument(
    input: PersonalModelSourceDocumentRecord
  ): Promise<PersonalModelSourceDocumentRecord>;
  deletePersonalModelSourceDocument(input: { ownerTgUserId: number; id: string }): Promise<void>;
  updatePersonalModelSourceDocument(input: {
    ownerTgUserId: number;
    id: string;
    patch: Partial<
      Pick<
        PersonalModelSourceDocumentRecord,
        | "sourceType"
        | "title"
        | "uri"
        | "status"
        | "usagePolicy"
        | "sensitivity"
        | "sourceCreatedAt"
        | "sourceUpdatedAt"
        | "metadataJson"
      >
    >;
  }): Promise<PersonalModelSourceDocumentRecord | null>;
  getPersonalModelSourceDocument(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<PersonalModelSourceDocumentRecord | null>;
  listPersonalModelSourceDocuments(input: {
    ownerTgUserId: number;
    limit: number;
    sourceType?: PersonalModelSourceType;
    status?: PersonalModelSourceStatus;
  }): Promise<PersonalModelSourceDocumentRecord[]>;
  createPersonalModelSourceChunk(
    input: PersonalModelSourceChunkRecord
  ): Promise<PersonalModelSourceChunkRecord>;
  updatePersonalModelSourceChunk(input: {
    ownerTgUserId: number;
    id: string;
    patch: Partial<
      Pick<PersonalModelSourceChunkRecord, "vectorId" | "indexedAt" | "indexStatus">
    >;
  }): Promise<PersonalModelSourceChunkRecord | null>;
  getPersonalModelSourceChunk(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<PersonalModelSourceChunkRecord | null>;
  listPersonalModelSourceChunks(input: {
    ownerTgUserId: number;
    documentId: string;
    limit: number;
  }): Promise<PersonalModelSourceChunkRecord[]>;
  searchPersonalModelSourceChunks(input: {
    ownerTgUserId: number;
    keyword: string;
    limit: number;
  }): Promise<PersonalModelSourceChunkRecord[]>;
  getPersonalModelSourceChunksByIds(input: {
    ownerTgUserId: number;
    ids: string[];
  }): Promise<PersonalModelSourceChunkRecord[]>;
  createPersonalModelEvidence(
    record: PersonalModelEvidenceRecord
  ): Promise<PersonalModelEvidenceRecord>;
  listPersonalModelEvidence(input: {
    ownerTgUserId: number;
    claimId: string;
    limit: number;
  }): Promise<PersonalModelEvidenceRecord[]>;
  createPersonalModelMetacognitionLog(
    record: PersonalModelMetacognitionLogRecord
  ): Promise<void>;
  listPersonalModelMetacognitionLogs(input: {
    ownerTgUserId: number;
    limit: number;
    offset: number;
  }): Promise<PersonalModelMetacognitionLogRecord[]>;
  createPersonalModelUnderstandingGap(
    record: PersonalModelUnderstandingGapRecord
  ): Promise<void>;
  listPersonalModelUnderstandingGaps(input: {
    ownerTgUserId: number;
    status?: UnderstandingGapStatus;
    limit: number;
    offset: number;
  }): Promise<PersonalModelUnderstandingGapRecord[]>;
  updatePersonalModelUnderstandingGapStatus(input: {
    ownerTgUserId: number;
    gapId: string;
    status: UnderstandingGapStatus;
    updatedAt: number;
  }): Promise<void>;
  createSkill(input: {
    ownerTgUserId: number;
    files: Record<string, string>;
    enabled: boolean;
    createdAt: number;
  }): Promise<SkillRecord>;
  updateSkillDraft(input: {
    ownerTgUserId: number;
    id: string;
    files: Record<string, string>;
    enabled: boolean;
    updatedAt: number;
  }): Promise<SkillRecord | null>;
  listSkills(ownerTgUserId: number, limit: number): Promise<SkillRecord[]>;
  getSkill(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<SkillRecord | null>;
  setSkillEnabled(input: {
    ownerTgUserId: number;
    id: string;
    enabled: boolean;
    updatedAt: number;
  }): Promise<SkillRecord | null>;
  softDeleteSkill(input: {
    ownerTgUserId: number;
    id: string;
    deletedAt: number;
  }): Promise<SkillRecord | null>;
  publishSkill(input: {
    ownerTgUserId: number;
    id: string;
    versionId: string;
    createdAt: number;
  }): Promise<SkillVersionRecord | null>;
  getRunnableSkillByName(input: {
    ownerTgUserId: number;
    name: string;
  }): Promise<RunnableSkillRecord | null>;
  listRunnableSkills(ownerTgUserId: number): Promise<RunnableSkillRecord[]>;
  createSkillRouteDecision(
    input: SkillRouteDecisionRecord
  ): Promise<SkillRouteDecisionRecord>;
  listSkillRouteDecisions(
    ownerTgUserId: number,
    limit: number
  ): Promise<SkillRouteDecisionRecord[]>;
  getSkillRouteDecisionForRun(input: {
    ownerTgUserId: number;
    runId: string;
  }): Promise<SkillRouteDecisionRecord | null>;
  createSkillRun(input: SkillRunRecord): Promise<SkillRunRecord>;
  updateSkillRun(input: {
    id: string;
    status: SkillRunStatus;
    outputText?: string | null;
    error?: string | null;
    updatedAt: number;
  }): Promise<void>;
  listSkillRuns(ownerTgUserId: number, limit: number): Promise<SkillRunRecord[]>;
  getSkillRunForRun(input: {
    ownerTgUserId: number;
    runId: string;
  }): Promise<SkillRunRecord | null>;
  createLongTask(input: LongTaskRecord): Promise<LongTaskRecord>;
  updateLongTask(input: {
    id: string;
    status: LongTaskStatus;
    title?: string;
    plannerReason?: string;
    currentStepId?: string | null;
    outputText?: string | null;
    error?: string | null;
    replanCount?: number;
    telegramChatId?: number | null;
    telegramMessageId?: number | null;
    updatedAt: number;
  }): Promise<void>;
  getLongTask(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<LongTaskRecord | null>;
  getLatestActiveLongTask(ownerTgUserId: number): Promise<LongTaskRecord | null>;
  getLongTaskForRun(input: {
    ownerTgUserId: number;
    runId: string;
  }): Promise<LongTaskRecord | null>;
  listLongTasks(ownerTgUserId: number, limit: number): Promise<LongTaskRecord[]>;
  listResumableLongTasks(now: number, limit: number): Promise<LongTaskRecord[]>;
  createLongTaskStep(input: LongTaskStepRecord): Promise<LongTaskStepRecord>;
  updateLongTaskStep(input: {
    id: string;
    status: LongTaskStepStatus;
    outputJson?: string | null;
    error?: string | null;
    startedAt?: number | null;
    completedAt?: number | null;
  }): Promise<void>;
  claimNextLongTaskStep(input: {
    longTaskId: string;
    startedAt: number;
  }): Promise<LongTaskStepRecord | null>;
  listLongTaskSteps(longTaskId: string): Promise<LongTaskStepRecord[]>;
  createLongTaskEvent(input: LongTaskEventRecord): Promise<LongTaskEventRecord>;
  listLongTaskEvents(longTaskId: string): Promise<LongTaskEventRecord[]>;
  createSchedule(input: ScheduleRecord): Promise<ScheduleRecord>;
  updateSchedule(input: {
    ownerTgUserId: number;
    id: string;
    name: string;
    commandText: string;
    enabled: boolean;
    timezone: "Asia/Shanghai";
    cadence: ScheduleCadence;
    timeOfDay: string;
    daysOfWeek: number[];
    nextRunAt: number;
    updatedAt: number;
  }): Promise<ScheduleRecord | null>;
  setScheduleEnabled(input: {
    ownerTgUserId: number;
    id: string;
    enabled: boolean;
    nextRunAt: number;
    updatedAt: number;
  }): Promise<ScheduleRecord | null>;
  softDeleteSchedule(input: {
    ownerTgUserId: number;
    id: string;
    deletedAt: number;
  }): Promise<ScheduleRecord | null>;
  getSchedule(input: {
    ownerTgUserId: number;
    id: string;
  }): Promise<ScheduleRecord | null>;
  listSchedules(ownerTgUserId: number, limit: number): Promise<ScheduleRecord[]>;
  listDueSchedules(now: number, limit: number): Promise<ScheduleRecord[]>;
  createScheduleExecution(
    input: ScheduleExecutionRecord
  ): Promise<ScheduleExecutionRecord | null>;
  updateScheduleExecution(input: {
    id: string;
    runId?: string | null;
    status: ScheduleExecutionStatus;
    outputText?: string | null;
    error?: string | null;
    updatedAt: number;
  }): Promise<void>;
  markScheduleExecuted(input: {
    id: string;
    lastRunAt: number;
    nextRunAt: number;
    updatedAt: number;
  }): Promise<void>;
  listScheduleExecutions(input: {
    ownerTgUserId: number;
    scheduleId?: string;
    limit: number;
  }): Promise<ScheduleExecutionRecord[]>;
  getScheduleExecutionForRun(input: {
    ownerTgUserId: number;
    runId: string;
  }): Promise<ScheduleExecutionRecord | null>;
  getUserProfile(id: string): Promise<UserProfileRecord | null>;
  upsertUserProfile(input: UserProfileRecord): Promise<UserProfileRecord>;

  createRunFeedback(input: RunFeedbackRecord): Promise<RunFeedbackRecord>;
  listRunFeedbacks(input: {
    ownerTgUserId: number;
    limit: number;
    offset: number;
  }): Promise<RunFeedbackRecord[]>;

  createRunEvaluation(input: RunEvaluationRecord): Promise<RunEvaluationRecord>;
  listRunEvaluations(input: {
    ownerTgUserId: number;
    limit: number;
    offset: number;
  }): Promise<RunEvaluationRecord[]>;
}
