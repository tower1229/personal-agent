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
