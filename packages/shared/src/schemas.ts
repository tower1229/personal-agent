import { z } from "zod";
import {
  approvalRequestStatuses,
  builtInToolNames,
  documentIndexStatuses,
  documentSourceTypes,
  evalCategories,
  memoryStatuses,
  memoryTypes,
  runStatuses,
  scheduleCadences,
  scheduleExecutionStatuses,
  skillKinds,
  skillRouteTriggerTypes,
  skillRunStatuses,
  todoStatuses,
  toolCallStatuses,
  toolRiskLevels,
  workflowRunSources,
  workflowSkillStepTypes
} from "./constants.js";

export const toolRiskLevelSchema = z.enum(toolRiskLevels);
export const builtInToolNameSchema = z.enum(builtInToolNames);
export const skillKindSchema = z.enum(skillKinds);
export const workflowSkillStepTypeSchema = z.enum(workflowSkillStepTypes);
export const scheduleCadenceSchema = z.enum(scheduleCadences);

export const workflowSkillStepSchema = z.object({
  id: z.string().min(1),
  type: workflowSkillStepTypeSchema,
  name: z.string().min(1).optional(),
  input: z.record(z.unknown()).optional(),
  nextStepId: z.string().min(1).optional()
});

export type WorkflowSkillStep = z.infer<typeof workflowSkillStepSchema>;

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
  confirmThreshold: z.number().min(0).max(1).default(0.45),
  workflowTemplate: z.array(workflowSkillStepSchema).default([])
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

export const adminWorkflowStepSchema = z.object({
  id: z.string().min(1),
  workflowRunId: z.string().min(1),
  stepId: z.string().min(1),
  stepType: workflowSkillStepTypeSchema,
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  inputJson: z.string(),
  outputJson: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.number().int().min(0).nullable(),
  completedAt: z.number().int().min(0).nullable(),
  createdAt: z.number().int().min(0)
});

export type AdminWorkflowStep = z.infer<typeof adminWorkflowStepSchema>;

export const adminWorkflowRunSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersionId: z.string().min(1),
  source: z.enum(workflowRunSources),
  status: z.enum(["running", "succeeded", "failed"]),
  inputText: z.string(),
  outputText: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export type AdminWorkflowRun = z.infer<typeof adminWorkflowRunSchema>;

export const adminWorkflowRunsResponseSchema = z.object({
  items: z.array(adminWorkflowRunSchema)
});

export type AdminWorkflowRunsResponse = z.infer<
  typeof adminWorkflowRunsResponseSchema
>;

export const adminWorkflowRunDetailResponseSchema = z.object({
  workflowRun: adminWorkflowRunSchema,
  steps: z.array(adminWorkflowStepSchema)
});

export type AdminWorkflowRunDetailResponse = z.infer<
  typeof adminWorkflowRunDetailResponseSchema
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
  workflowRun: adminWorkflowRunSchema.nullable(),
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
