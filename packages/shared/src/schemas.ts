import { z } from "zod";
import {
  approvalRequestStatuses,
  builtInToolNames,
  documentIndexStatuses,
  documentSourceTypes,
  evalCategories,
  longTaskStatuses,
  longTaskStepStatuses,
  longTaskToolPolicies,
  memoryStatuses,
  memoryTypes,
  metacognitionReflectionTypes,
  personalModelConfidences,
  personalModelEventTypes,
  personalModelEvidenceTypes,
  personalModelEvidenceWeights,
  personalModelLayers,
  personalModelScenarios,
  personalModelSensitivities,
  personalModelSourceStatuses,
  personalModelSourceTypes,
  personalModelStatuses,
  personalModelUsagePolicies,
  runStatuses,
  scheduleCadences,
  scheduleExecutionStatuses,
  skillKinds,
  skillRouteTriggerTypes,
  skillRunStatuses,
  todoStatuses,
  toolCallStatuses,
  toolRiskLevels,
  understandingGapStatuses,
  runFeedbackTypes
} from "./constants.js";

export const toolRiskLevelSchema = z.enum(toolRiskLevels);
export const builtInToolNameSchema = z.enum(builtInToolNames);
export const skillKindSchema = z.enum(skillKinds);
export const scheduleCadenceSchema = z.enum(scheduleCadences);
export const longTaskStatusSchema = z.enum(longTaskStatuses);
export const longTaskStepStatusSchema = z.enum(longTaskStepStatuses);
export const longTaskToolPolicySchema = z.enum(longTaskToolPolicies);

export const skillManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  kind: skillKindSchema,
  enabled: z.boolean(),
  triggerPhrases: z.array(z.string().min(1)).default([]),
  intentExamples: z.array(z.string().min(1)).default([]),
  instructions: z.string().min(1),
  allowedTools: z.array(builtInToolNameSchema).default([]),
  riskLevel: toolRiskLevelSchema.default("read"),
  autoRunThreshold: z.number().min(0).max(1).default(0.75),
  confirmThreshold: z.number().min(0).max(1).default(0.45)
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const adminSkillListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  kind: skillKindSchema,
  enabled: z.boolean(),
  deleted: z.boolean(),
  publishedVersionId: z.string().min(1).nullable(),
  updatedAt: z.number().int().min(0)
});

export type AdminSkillListItem = z.infer<typeof adminSkillListItemSchema>;

export const adminSkillsResponseSchema = z.object({
  items: z.array(adminSkillListItemSchema)
});

export type AdminSkillsResponse = z.infer<typeof adminSkillsResponseSchema>;

export const adminSkillDetailSchema = z.object({
  id: z.string().min(1),
  manifest: skillManifestSchema,
  enabled: z.boolean(),
  deleted: z.boolean(),
  publishedVersionId: z.string().min(1).nullable(),
  publishedVersion: z.number().int().min(1).nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminSkillDetail = z.infer<typeof adminSkillDetailSchema>;

export const adminSkillDetailResponseSchema = z.object({
  skill: adminSkillDetailSchema
});

export type AdminSkillDetailResponse = z.infer<
  typeof adminSkillDetailResponseSchema
>;

export const adminSkillUpsertRequestSchema = z.object({
  manifest: skillManifestSchema
});

export type AdminSkillUpsertRequest = z.infer<
  typeof adminSkillUpsertRequestSchema
>;

export const adminSkillPublishResponseSchema = z.object({
  ok: z.literal(true),
  versionId: z.string().min(1),
  version: z.number().int().min(1)
});

export type AdminSkillPublishResponse = z.infer<
  typeof adminSkillPublishResponseSchema
>;

export const adminSkillTestRunRequestSchema = z.object({
  input: z.string().min(1)
});

export type AdminSkillTestRunRequest = z.infer<
  typeof adminSkillTestRunRequestSchema
>;

export const adminSkillTestRunResponseSchema = z.object({
  ok: z.literal(true),
  runId: z.string().min(1),
  skillRunId: z.string().min(1),
  output: z.string()
});

export type AdminSkillTestRunResponse = z.infer<
  typeof adminSkillTestRunResponseSchema
>;

export const adminSkillRunSummarySchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersionId: z.string().min(1),
  status: z.enum(skillRunStatuses),
  inputText: z.string(),
  outputText: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminSkillRunSummary = z.infer<
  typeof adminSkillRunSummarySchema
>;

export const adminSkillRunsResponseSchema = z.object({
  items: z.array(adminSkillRunSummarySchema)
});

export type AdminSkillRunsResponse = z.infer<
  typeof adminSkillRunsResponseSchema
>;

export const adminSkillRouteDecisionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  triggerType: z.enum(skillRouteTriggerTypes),
  matchedSkillId: z.string().min(1).nullable(),
  matchedSkillVersionId: z.string().min(1).nullable(),
  inputText: z.string(),
  reason: z.string(),
  createdAt: z.number().int().min(0)
});

export type AdminSkillRouteDecision = z.infer<
  typeof adminSkillRouteDecisionSchema
>;

export const adminSkillRouteDecisionsResponseSchema = z.object({
  items: z.array(adminSkillRouteDecisionSchema)
});

export type AdminSkillRouteDecisionsResponse = z.infer<
  typeof adminSkillRouteDecisionsResponseSchema
>;

export const adminApiErrorSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1).optional(),
  details: z.unknown().optional()
});

export type AdminApiError = z.infer<typeof adminApiErrorSchema>;

export const adminApiSuccessSchema = z.object({
  ok: z.literal(true)
});

export type AdminApiSuccess = z.infer<typeof adminApiSuccessSchema>;

export const adminHealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("personal-agent-worker")
});

export type AdminHealthResponse = z.infer<typeof adminHealthResponseSchema>;

export const adminUserSchema = z.object({
  id: z.number().int().min(1),
  username: z.string().optional(),
  firstName: z.string().optional(),
  photoUrl: z.string().url().optional()
});

export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminMeResponseSchema = z.discriminatedUnion("authenticated", [
  z.object({
    authenticated: z.literal(false)
  }),
  z.object({
    authenticated: z.literal(true),
    user: adminUserSchema
  })
]);

export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;

export const adminAuthConfigResponseSchema = z.object({
  botUsername: z.string().min(1).nullable(),
  configured: z.boolean()
});

export type AdminAuthConfigResponse = z.infer<
  typeof adminAuthConfigResponseSchema
>;

export const adminAgentConfigResponseSchema = z.object({
  llmConfigured: z.boolean(),
  llmBaseUrl: z.string().min(1).nullable(),
  llmModel: z.string().min(1).nullable(),
  maxToolRounds: z.number().int().min(0),
  braveSearchConfigured: z.boolean(),
  fetchUrlMaxBytes: z.number().int().min(1)
});

export type AdminAgentConfigResponse = z.infer<
  typeof adminAgentConfigResponseSchema
>;

export const adminD1TableStatusSchema = z.object({
  name: z.string().min(1),
  present: z.boolean()
});

export type AdminD1TableStatus = z.infer<typeof adminD1TableStatusSchema>;

export const adminD1ReadinessResponseSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.number().int().min(0),
  requiredTables: z.array(adminD1TableStatusSchema),
  missingTables: z.array(z.string().min(1)),
  migrationCommand: z.literal("npm run d1:migrate:worker:remote")
});

export type AdminD1ReadinessResponse = z.infer<
  typeof adminD1ReadinessResponseSchema
>;

export const adminAgentTestLlmRequestSchema = z.object({
  prompt: z.string().min(1)
});

export type AdminAgentTestLlmRequest = z.infer<
  typeof adminAgentTestLlmRequestSchema
>;

export const adminAgentTestLlmResponseSchema = z.object({
  ok: z.literal(true),
  output: z.string().min(1)
});

export type AdminAgentTestLlmResponse = z.infer<
  typeof adminAgentTestLlmResponseSchema
>;

export const adminAgentTestSearchRequestSchema = z.object({
  query: z.string().min(1)
});

export type AdminAgentTestSearchRequest = z.infer<
  typeof adminAgentTestSearchRequestSchema
>;

export const adminAgentTestSearchResponseSchema = z.object({
  ok: z.literal(true),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      description: z.string(),
      source: z.string(),
      rank: z.number().int().min(1)
    })
  )
});

export type AdminAgentTestSearchResponse = z.infer<
  typeof adminAgentTestSearchResponseSchema
>;

export const adminLongTaskSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  title: z.string().min(1),
  originalInput: z.string(),
  status: longTaskStatusSchema,
  complexityScore: z.number().min(0).max(1),
  plannerReason: z.string(),
  currentStepId: z.string().min(1).nullable(),
  outputText: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminLongTask = z.infer<typeof adminLongTaskSchema>;

export const adminLongTaskStepSchema = z.object({
  id: z.string().min(1),
  longTaskId: z.string().min(1),
  position: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: longTaskStepStatusSchema,
  toolPolicy: longTaskToolPolicySchema,
  successCriteria: z.string(),
  inputJson: z.string(),
  outputJson: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.number().int().min(0).nullable(),
  completedAt: z.number().int().min(0).nullable(),
  createdAt: z.number().int().min(0)
});

export type AdminLongTaskStep = z.infer<typeof adminLongTaskStepSchema>;

export const adminLongTaskEventSchema = z.object({
  id: z.string().min(1),
  longTaskId: z.string().min(1),
  stepId: z.string().min(1).nullable(),
  eventType: z.string().min(1),
  payloadJson: z.string(),
  createdAt: z.number().int().min(0)
});

export type AdminLongTaskEvent = z.infer<typeof adminLongTaskEventSchema>;

export const adminLongTasksResponseSchema = z.object({
  items: z.array(adminLongTaskSchema)
});

export type AdminLongTasksResponse = z.infer<
  typeof adminLongTasksResponseSchema
>;

export const adminLongTaskDetailResponseSchema = z.object({
  task: adminLongTaskSchema,
  steps: z.array(adminLongTaskStepSchema),
  events: z.array(adminLongTaskEventSchema)
});

export type AdminLongTaskDetailResponse = z.infer<
  typeof adminLongTaskDetailResponseSchema
>;

export const adminScheduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  commandText: z.string().min(1),
  enabled: z.boolean(),
  timezone: z.literal("Asia/Shanghai"),
  cadence: scheduleCadenceSchema,
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(1).max(7)),
  nextRunAt: z.number().int().min(0),
  lastRunAt: z.number().int().min(0).nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminSchedule = z.infer<typeof adminScheduleSchema>;

export const adminSchedulesResponseSchema = z.object({
  items: z.array(adminScheduleSchema)
});

export type AdminSchedulesResponse = z.infer<
  typeof adminSchedulesResponseSchema
>;

export const adminScheduleUpsertRequestSchema = z
  .object({
    name: z.string().min(1),
    commandText: z.string().min(1),
    enabled: z.boolean(),
    timezone: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
    cadence: scheduleCadenceSchema,
    timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).default([])
  })
  .superRefine((value, ctx) => {
    if (value.cadence === "weekly" && value.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["daysOfWeek"],
        message: "Weekly schedules require at least one day"
      });
    }
  });

export type AdminScheduleUpsertRequest = z.infer<
  typeof adminScheduleUpsertRequestSchema
>;

export const adminScheduleExecutionSchema = z.object({
  id: z.string().min(1),
  scheduleId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  scheduledFor: z.number().int().min(0),
  status: z.enum(scheduleExecutionStatuses),
  outputText: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminScheduleExecution = z.infer<
  typeof adminScheduleExecutionSchema
>;

export const adminScheduleExecutionsResponseSchema = z.object({
  items: z.array(adminScheduleExecutionSchema)
});

export type AdminScheduleExecutionsResponse = z.infer<
  typeof adminScheduleExecutionsResponseSchema
>;

export const adminRunSummarySchema = z.object({
  id: z.string().min(1),
  status: z.enum(runStatuses),
  messageText: z.string().nullable(),
  responseText: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminRunSummary = z.infer<typeof adminRunSummarySchema>;

export const adminRunsResponseSchema = z.object({
  items: z.array(adminRunSummarySchema)
});

export type AdminRunsResponse = z.infer<typeof adminRunsResponseSchema>;

export const adminToolCallSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  toolName: z.string().min(1),
  riskLevel: toolRiskLevelSchema,
  status: z.enum(toolCallStatuses),
  inputJson: z.string(),
  outputJson: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0)
});

export type AdminToolCall = z.infer<typeof adminToolCallSchema>;

export const adminRunDetailResponseSchema = z.object({
  run: adminRunSummarySchema,
  toolCalls: z.array(adminToolCallSchema),
  skillRouteDecision: adminSkillRouteDecisionSchema.nullable(),
  skillRun: adminSkillRunSummarySchema.nullable(),
  longTask: adminLongTaskSchema.nullable(),
  scheduleExecution: adminScheduleExecutionSchema.nullable()
});

export type AdminRunDetailResponse = z.infer<
  typeof adminRunDetailResponseSchema
>;

export const adminTodoSchema = z.object({
  id: z.number().int().min(1),
  title: z.string().min(1),
  status: z.enum(todoStatuses),
  createdAt: z.number().int().min(0),
  completedAt: z.number().int().min(0).nullable()
});

export type AdminTodo = z.infer<typeof adminTodoSchema>;

export const adminTodosResponseSchema = z.object({
  items: z.array(adminTodoSchema)
});

export type AdminTodosResponse = z.infer<typeof adminTodosResponseSchema>;

export const adminMemorySchema = z.object({
  id: z.number().int().min(1),
  content: z.string().min(1),
  status: z.enum(memoryStatuses),
  createdAt: z.number().int().min(0),
  deletedAt: z.number().int().min(0).nullable()
});

export type AdminMemory = z.infer<typeof adminMemorySchema>;

export const adminMemoriesResponseSchema = z.object({
  items: z.array(adminMemorySchema)
});

export type AdminMemoriesResponse = z.infer<
  typeof adminMemoriesResponseSchema
>;

export const personalModelLayerSchema = z.enum(personalModelLayers);
export const personalModelScenarioSchema = z.enum(personalModelScenarios);
export const personalModelConfidenceSchema = z.enum(personalModelConfidences);
export const personalModelStatusSchema = z.enum(personalModelStatuses);
export const personalModelUsagePolicySchema = z.enum(
  personalModelUsagePolicies
);
export const personalModelSensitivitySchema = z.enum(
  personalModelSensitivities
);
export const personalModelEventTypeSchema = z.enum(personalModelEventTypes);
export const personalModelSourceTypeSchema = z.enum(personalModelSourceTypes);
export const personalModelSourceStatusSchema = z.enum(
  personalModelSourceStatuses
);
export const personalModelEvidenceTypeSchema = z.enum(
  personalModelEvidenceTypes
);
export const personalModelEvidenceWeightSchema = z.enum(
  personalModelEvidenceWeights
);

export const adminPersonalModelClaimSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  layer: personalModelLayerSchema,
  scenario: personalModelScenarioSchema,
  confidence: personalModelConfidenceSchema,
  status: personalModelStatusSchema,
  usagePolicy: personalModelUsagePolicySchema,
  sensitivity: personalModelSensitivitySchema,
  validFrom: z.number().int().min(0).nullable(),
  validUntil: z.number().int().min(0).nullable(),
  lastConfirmedAt: z.number().int().min(0).nullable(),
  metadataJson: z.string(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminPersonalModelClaim = z.infer<
  typeof adminPersonalModelClaimSchema
>;

export const adminPersonalModelSourceDocumentSchema = z.object({
  id: z.string().min(1),
  sourceType: personalModelSourceTypeSchema,
  title: z.string().min(1),
  uri: z.string().nullable(),
  content: z.string(),
  status: personalModelSourceStatusSchema,
  usagePolicy: personalModelUsagePolicySchema,
  sensitivity: personalModelSensitivitySchema,
  sourceCreatedAt: z.number().int().min(0).nullable(),
  sourceUpdatedAt: z.number().int().min(0).nullable(),
  ingestedAt: z.number().int().min(0),
  metadataJson: z.string()
});

export const personalModelWritingMetadataSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  publishDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isOriginal: z.boolean().optional()
});
export type PersonalModelWritingMetadata = z.infer<typeof personalModelWritingMetadataSchema>;

export const personalModelFrameworkMetadataSchema = z.object({
  frameworkType: z.string().optional(),
  testDate: z.string().optional(),
  agreementLevel: z.string().optional(),
  stableDimensions: z.array(z.string()).optional()
});
export type PersonalModelFrameworkMetadata = z.infer<typeof personalModelFrameworkMetadataSchema>;

export const personalModelSocialMetadataSchema = z.object({
  originalTimestamp: z.number().int().optional(),
  platform: z.string().optional(),
  isHistoricalExpression: z.boolean().optional()
});
export type PersonalModelSocialMetadata = z.infer<typeof personalModelSocialMetadataSchema>;

export type AdminPersonalModelSourceDocument = z.infer<
  typeof adminPersonalModelSourceDocumentSchema
>;

export const adminPersonalModelSourceChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  chunkIndex: z.number().int().min(0),
  content: z.string(),
  tokenCount: z.number().int().min(0).nullable(),
  metadataJson: z.string(),
  createdAt: z.number().int().min(0)
});

export type AdminPersonalModelSourceChunk = z.infer<
  typeof adminPersonalModelSourceChunkSchema
>;

export const adminPersonalModelEvidenceSchema = z.object({
  id: z.string().min(1),
  claimId: z.string().min(1),
  evidenceType: personalModelEvidenceTypeSchema,
  sourceDocumentId: z.string().min(1).nullable(),
  sourceChunkId: z.string().min(1).nullable(),
  runId: z.string().min(1).nullable(),
  quote: z.string().nullable(),
  weight: personalModelEvidenceWeightSchema,
  createdAt: z.number().int().min(0)
});

export type AdminPersonalModelEvidence = z.infer<
  typeof adminPersonalModelEvidenceSchema
>;

export const adminPersonalModelClaimsResponseSchema = z.object({
  items: z.array(adminPersonalModelClaimSchema)
});

export type AdminPersonalModelClaimsResponse = z.infer<
  typeof adminPersonalModelClaimsResponseSchema
>;

export const adminPersonalModelClaimEventSchema = z.object({
  id: z.string().min(1),
  claimId: z.string().min(1).nullable(),
  eventType: personalModelEventTypeSchema,
  payloadJson: z.string(),
  createdAt: z.number().int().min(0)
});

export type AdminPersonalModelClaimEvent = z.infer<
  typeof adminPersonalModelClaimEventSchema
>;

export const adminPersonalModelClaimDetailResponseSchema = z.object({
  claim: adminPersonalModelClaimSchema,
  events: z.array(adminPersonalModelClaimEventSchema),
  evidence: z.array(adminPersonalModelEvidenceSchema).default([])
});

export type AdminPersonalModelClaimDetailResponse = z.infer<
  typeof adminPersonalModelClaimDetailResponseSchema
>;

export const adminPersonalModelClaimEventsResponseSchema = z.object({
  items: z.array(adminPersonalModelClaimEventSchema)
});

export type AdminPersonalModelClaimEventsResponse = z.infer<
  typeof adminPersonalModelClaimEventsResponseSchema
>;

export const adminPersonalModelClaimCreateRequestSchema = z.object({
  claim: z.string().min(1),
  layer: personalModelLayerSchema.default("preference"),
  scenario: personalModelScenarioSchema.default("global"),
  confidence: personalModelConfidenceSchema.default("high"),
  status: personalModelStatusSchema.default("active"),
  usagePolicy: personalModelUsagePolicySchema.default("default_available"),
  sensitivity: personalModelSensitivitySchema.default("medium"),
  validFrom: z.number().int().min(0).nullable().optional(),
  validUntil: z.number().int().min(0).nullable().optional(),
  lastConfirmedAt: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.unknown()).default({})
});

export type AdminPersonalModelClaimCreateRequest = z.infer<
  typeof adminPersonalModelClaimCreateRequestSchema
>;

export const adminPersonalModelClaimUpdateRequestSchema = z.object({
  claim: z.string().min(1).optional(),
  layer: personalModelLayerSchema.optional(),
  scenario: personalModelScenarioSchema.optional(),
  confidence: personalModelConfidenceSchema.optional(),
  status: personalModelStatusSchema.optional(),
  usagePolicy: personalModelUsagePolicySchema.optional(),
  sensitivity: personalModelSensitivitySchema.optional(),
  validFrom: z.number().int().min(0).nullable().optional(),
  validUntil: z.number().int().min(0).nullable().optional(),
  lastConfirmedAt: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type AdminPersonalModelClaimUpdateRequest = z.infer<
  typeof adminPersonalModelClaimUpdateRequestSchema
>;

export const adminPersonalModelSourcesResponseSchema = z.object({
  items: z.array(adminPersonalModelSourceDocumentSchema)
});

export type AdminPersonalModelSourcesResponse = z.infer<
  typeof adminPersonalModelSourcesResponseSchema
>;

export const adminPersonalModelSourceDetailResponseSchema = z.object({
  source: adminPersonalModelSourceDocumentSchema,
  chunks: z.array(adminPersonalModelSourceChunkSchema)
});

export type AdminPersonalModelSourceDetailResponse = z.infer<
  typeof adminPersonalModelSourceDetailResponseSchema
>;

export const adminPersonalModelSourceCreateRequestSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  sourceType: personalModelSourceTypeSchema.default("manual_note"),
  uri: z.string().min(1).nullable().optional(),
  usagePolicy: personalModelUsagePolicySchema.default("default_available"),
  sensitivity: personalModelSensitivitySchema.default("medium"),
  sourceCreatedAt: z.number().int().min(0).nullable().optional(),
  sourceUpdatedAt: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.unknown()).default({})
});

export type AdminPersonalModelSourceCreateRequest = z.infer<
  typeof adminPersonalModelSourceCreateRequestSchema
>;

export const adminPersonalModelSourceUpdateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  uri: z.string().min(1).nullable().optional(),
  sourceType: personalModelSourceTypeSchema.optional(),
  status: personalModelSourceStatusSchema.optional(),
  usagePolicy: personalModelUsagePolicySchema.optional(),
  sensitivity: personalModelSensitivitySchema.optional(),
  sourceCreatedAt: z.number().int().min(0).nullable().optional(),
  sourceUpdatedAt: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type AdminPersonalModelSourceUpdateRequest = z.infer<
  typeof adminPersonalModelSourceUpdateRequestSchema
>;

export const adminPersonalModelEvidenceCreateRequestSchema = z.object({
  evidenceType: personalModelEvidenceTypeSchema.default("source_chunk"),
  sourceDocumentId: z.string().min(1).nullable().optional(),
  sourceChunkId: z.string().min(1).nullable().optional(),
  runId: z.string().min(1).nullable().optional(),
  quote: z.string().nullable().optional(),
  weight: personalModelEvidenceWeightSchema.default("medium")
});

export type AdminPersonalModelEvidenceCreateRequest = z.infer<
  typeof adminPersonalModelEvidenceCreateRequestSchema
>;

export const adminPersonalModelEvidenceResponseSchema = z.object({
  items: z.array(adminPersonalModelEvidenceSchema)
});

export type AdminPersonalModelEvidenceResponse = z.infer<
  typeof adminPersonalModelEvidenceResponseSchema
>;

export const adminApprovalSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  status: z.enum(approvalRequestStatuses),
  code: z.string().min(1),
  createdAt: z.number().int().min(0),
  decidedAt: z.number().int().min(0).nullable()
});

export type AdminApproval = z.infer<typeof adminApprovalSchema>;

export const adminApprovalsResponseSchema = z.object({
  items: z.array(adminApprovalSchema)
});

export type AdminApprovalsResponse = z.infer<
  typeof adminApprovalsResponseSchema
>;

export const telegramLoginUserSchema = z.object({
  id: z.coerce.number().int().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.coerce.number().int().min(1),
  hash: z.string().min(1)
});

export type TelegramLoginUser = z.infer<typeof telegramLoginUserSchema>;

export const telegramUserSchema = z.object({
  id: z.number().int().min(1),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional()
});

export const telegramWebhookUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      from: telegramUserSchema.optional(),
      chat: z.object({
        id: z.number().int()
      }),
      text: z.string().optional()
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: telegramUserSchema,
      data: z.string().optional()
    })
    .optional()
});

export type TelegramWebhookUpdate = z.infer<
  typeof telegramWebhookUpdateSchema
>;

export const telegramWebhookResponseSchema = z.object({
  ok: z.literal(true),
  ignored: z.boolean().optional(),
  accepted: z.boolean().optional(),
  runId: z.string().min(1).optional()
});

export type TelegramWebhookResponse = z.infer<
  typeof telegramWebhookResponseSchema
>;

export const evalSetupActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_todo"),
    title: z.string().min(1),
    dueAt: z.string().nullable().optional()
  }),
  z.object({
    type: z.literal("save_memory"),
    memoryType: z.enum(memoryTypes),
    content: z.string().min(1),
    confidence: z.number().int().min(0).max(100).optional(),
    importance: z.number().int().min(0).max(100).optional(),
    source: z.string().nullable().optional()
  }),
  z.object({
    type: z.literal("delete_memory_matching"),
    keyword: z.string().min(1),
    reason: z.string().nullable().optional()
  }),
  z.object({
    type: z.literal("add_document"),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceType: z.enum(documentSourceTypes).optional()
  }),
  z.object({
    type: z.literal("add_document_for_other_user"),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceType: z.enum(documentSourceTypes).optional()
  }),
  z.object({
    type: z.literal("create_pending_approval"),
    toolName: z.string().min(1),
    args: z.record(z.unknown()),
    approvalCode: z.string().nullable().optional(),
    expiresAtOffsetMs: z.number().int().nullable().optional()
  })
]);

export type EvalSetupAction = z.infer<typeof evalSetupActionSchema>;

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(evalCategories),
  input: z.string().min(1),
  setup: z.array(evalSetupActionSchema).optional(),
  expectedTools: z.array(z.string()).default([]),
  expectedKeywords: z.array(z.string()).default([]),
  expectedAnyKeywords: z.array(z.string()).optional(),
  forbiddenKeywords: z.array(z.string()).default([]),
  expectedBehavior: z.string().min(1),
  riskLevel: toolRiskLevelSchema.optional(),
  expectedApprovalStatus: z.enum(approvalRequestStatuses).optional(),
  expectedApprovalCodeRequired: z.boolean().optional()
});

export type EvalCase = z.infer<typeof evalCaseSchema>;

export const documentIndexStatusSchema = z.enum(documentIndexStatuses);
export const documentSourceTypeSchema = z.enum(documentSourceTypes);

export const personalModelMetacognitionReflectionTypeSchema = z.enum(metacognitionReflectionTypes);
export const personalModelMetacognitionLogDtoSchema = z.object({
  id: z.string().min(1),
  relatedClaimId: z.string().min(1).nullable(),
  relatedGapId: z.string().min(1).nullable(),
  reflectionType: personalModelMetacognitionReflectionTypeSchema,
  content: z.string(),
  createdAt: z.number().int().min(0)
});
export type PersonalModelMetacognitionLogDto = z.infer<typeof personalModelMetacognitionLogDtoSchema>;

export const personalModelUnderstandingGapStatusSchema = z.enum(understandingGapStatuses);
export const personalModelUnderstandingGapDtoSchema = z.object({
  id: z.string().min(1),
  scenario: personalModelScenarioSchema,
  gapDescription: z.string(),
  status: personalModelUnderstandingGapStatusSchema,
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});
export type PersonalModelUnderstandingGapDto = z.infer<typeof personalModelUnderstandingGapDtoSchema>;

export const adminPersonalModelMetacognitionLogsResponseSchema = z.object({
  items: z.array(personalModelMetacognitionLogDtoSchema)
});
export type AdminPersonalModelMetacognitionLogsResponse = z.infer<typeof adminPersonalModelMetacognitionLogsResponseSchema>;

export const adminPersonalModelUnderstandingGapsResponseSchema = z.object({
  items: z.array(personalModelUnderstandingGapDtoSchema)
});
export type AdminPersonalModelUnderstandingGapsResponse = z.infer<typeof adminPersonalModelUnderstandingGapsResponseSchema>;

export const adminPersonalModelUnderstandingGapUpdateRequestSchema = z.object({
  status: personalModelUnderstandingGapStatusSchema
});
export type AdminPersonalModelUnderstandingGapUpdateRequest = z.infer<typeof adminPersonalModelUnderstandingGapUpdateRequestSchema>;

export const adminPersonalModelUnderstandingGapCreateRequestSchema = z.object({
  scenario: personalModelScenarioSchema,
  gapDescription: z.string().min(1)
});
export type AdminPersonalModelUnderstandingGapCreateRequest = z.infer<typeof adminPersonalModelUnderstandingGapCreateRequestSchema>;

export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  birthdayTimestamp: z.number().int().nullable(),
  gender: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const userProfileUpdateRequestSchema = z.object({
  name: z.string().optional(),
  birthdayTimestamp: z.number().int().nullable().optional(),
  gender: z.string().nullable().optional()
});
export type UserProfileUpdateRequest = z.infer<typeof userProfileUpdateRequestSchema>;

export const runFeedbackTypeSchema = z.enum(runFeedbackTypes);
export const runFeedbackDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  feedbackType: runFeedbackTypeSchema,
  comment: z.string().nullable(),
  createdAt: z.number().int().min(0)
});
export type RunFeedbackDto = z.infer<typeof runFeedbackDtoSchema>;

export const runEvaluationDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  groundednessScore: z.number().int().min(1).max(5),
  oldDataMisuseScore: z.number().int().min(1).max(5),
  adviceFitScore: z.number().int().min(1).max(5),
  emotionalCalibrationScore: z.number().int().min(1).max(5),
  reasoning: z.string(),
  createdAt: z.number().int().min(0)
});
export type RunEvaluationDto = z.infer<typeof runEvaluationDtoSchema>;

export const adminFeedbacksResponseSchema = z.object({
  items: z.array(runFeedbackDtoSchema)
});
export type AdminFeedbacksResponse = z.infer<typeof adminFeedbacksResponseSchema>;

export const adminEvaluationsResponseSchema = z.object({
  items: z.array(runEvaluationDtoSchema)
});
export type AdminEvaluationsResponse = z.infer<typeof adminEvaluationsResponseSchema>;
