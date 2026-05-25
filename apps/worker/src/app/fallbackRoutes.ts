import { type Hono } from "hono";
import {
  adminAgentConfigResponseSchema,
  adminAgentTestLlmRequestSchema,
  adminAgentTestLlmResponseSchema,
  adminAgentTestSearchRequestSchema,
  adminAgentTestSearchResponseSchema,
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminHealthResponseSchema,
  adminMemoriesResponseSchema,
  adminMeResponseSchema,
  adminApiSuccessSchema,
  adminRunDetailResponseSchema,
  adminSkillDetailResponseSchema,
  adminSkillPublishResponseSchema,
  adminSkillRouteDecisionsResponseSchema,
  adminSkillRunsResponseSchema,
  adminSkillsResponseSchema,
  adminSkillTestRunRequestSchema,
  adminSkillTestRunResponseSchema,
  adminSkillUpsertRequestSchema,
  adminScheduleExecutionsResponseSchema,
  adminScheduleSchema,
  adminScheduleUpsertRequestSchema,
  adminSchedulesResponseSchema,
  adminRunsResponseSchema,
  adminTodosResponseSchema,
  adminWorkflowRunDetailResponseSchema,
  adminWorkflowRunsResponseSchema,
  skillManifestSchema,
  telegramWebhookResponseSchema
} from "@personal-agent/shared";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  getCookieValue,
  getSessionCookieName,
  signSession,
  verifySession,
  verifyTelegramLogin
} from "../auth.js";
import { executeSkill, handleOwnerUpdate, type BotRuntime } from "../bot.js";
import { executeLlmAgent } from "../agent.js";
import { normalizeLlmBaseUrl, parseMaxToolRounds } from "../llm.js";
import { getTelegramUpdateUserId, parseTelegramUpdate } from "../telegram.js";
import { executeScheduleCommand, nextScheduleRunAt, normalizeScheduleRequest } from "../schedules.js";
import { unauthorizedWorkflowStepTools, unsupportedWorkflowStepTypes } from "../workflowValidation.js";
import { type AgentRepositories } from "../repositories.js";
import { type WorkerEnv } from "../types.js";
import {
  checkD1Readiness,
  defaultGenerateId,
  limitParam,
  ownerId,
  telegramBotUsername
} from "./helpers.js";
import {
  toAdminApproval,
  toAdminMemory,
  toAdminRun,
  toAdminSchedule,
  toAdminScheduleExecution,
  toAdminSkill,
  toAdminSkillDetail,
  toAdminSkillRouteDecision,
  toAdminSkillRun,
  toAdminTodo,
  toAdminToolCall,
  toAdminWorkflowRun,
  toAdminWorkflowStep
} from "./serializers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerFallbackRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const {
    options,
    repositories,
    fetchUrlMaxBytes,
    llmClient,
    searchClient,
    runtime,
    adminOwnerId
  } = context;

  app.notFound((c) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }

    return c.text("Not Found", 404);
  });
}
