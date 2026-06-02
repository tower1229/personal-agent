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
  toAdminToolCall
} from "./serializers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerAuthRoutes(
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

  app.get("/auth/telegram/callback", async (c) => {
    const user = await verifyTelegramLogin({
      query: new URL(c.req.url).searchParams,
      botToken: c.env.TELEGRAM_BOT_TOKEN
    });

    if (!user || user.id !== ownerId(c.env)) {
      return c.text("Unauthorized", 401);
    }

    const session = await signSession({
      user,
      secret: c.env.ADMIN_SESSION_SECRET
    });
    c.header("Set-Cookie", buildSessionCookie({ value: session }));

    return c.redirect("/admin");
  });

}
