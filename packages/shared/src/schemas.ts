import { z } from "zod";
import {
  approvalRequestStatuses,
  documentIndexStatuses,
  documentSourceTypes,
  evalCategories,
  memoryTypes,
  skillKinds,
  toolRiskLevels,
  workflowSkillStepTypes
} from "./constants.js";

export const toolRiskLevelSchema = z.enum(toolRiskLevels);
export const skillKindSchema = z.enum(skillKinds);
export const workflowSkillStepTypeSchema = z.enum(workflowSkillStepTypes);

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
  allowedTools: z.array(z.string().min(1)).default([]),
  riskLevel: toolRiskLevelSchema.default("read"),
  autoRunThreshold: z.number().min(0).max(1).default(0.75),
  confirmThreshold: z.number().min(0).max(1).default(0.45),
  workflowTemplate: z.array(workflowSkillStepSchema).default([])
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

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
  botUsername: z.string().min(1)
});

export type AdminAuthConfigResponse = z.infer<
  typeof adminAuthConfigResponseSchema
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
  accepted: z.boolean().optional()
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
