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
  skillManifestSchema,
  telegramWebhookResponseSchema,
  adminFeedbacksResponseSchema,
  adminEvaluationsResponseSchema
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
  toAdminLongTask,
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

export function registerAdminDataRoutes(
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

  app.get("/api/admin/runs", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listRuns(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminRunsResponseSchema.parse({
        items: items.map(toAdminRun)
      })
    );
  });

  app.get("/api/admin/runs/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repo = repositories(c.env);
    const run = await repo.getRun({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [
      toolCalls,
      skillRouteDecision,
      skillRun,
      longTask,
      scheduleExecution
    ] = await Promise.all([
      repo.listToolCallsForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getSkillRouteDecisionForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getSkillRunForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getLongTaskForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getScheduleExecutionForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      })
    ]);

    return c.json(
      adminRunDetailResponseSchema.parse({
        run: toAdminRun(run),
        toolCalls: toolCalls.map(toAdminToolCall),
        skillRouteDecision: skillRouteDecision
          ? toAdminSkillRouteDecision(skillRouteDecision)
          : null,
        skillRun: skillRun ? toAdminSkillRun(skillRun) : null,
        longTask: longTask ? toAdminLongTask(longTask) : null,
        scheduleExecution: scheduleExecution
          ? toAdminScheduleExecution(scheduleExecution)
          : null
      })
    );
  });

  app.get("/api/admin/todos", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listTodos(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminTodosResponseSchema.parse({
        items: items.map(toAdminTodo)
      })
    );
  });

  app.get("/api/admin/memories", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listMemories(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminMemoriesResponseSchema.parse({
        items: items.map(toAdminMemory)
      })
    );
  });

  app.get("/api/admin/approvals", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listApprovals(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminApprovalsResponseSchema.parse({
        items: items.map(toAdminApproval)
      })
    );
  });

  app.get("/api/admin/feedbacks", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listRunFeedbacks({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      offset: 0 // Simplification for now
    });

    return c.json(
      adminFeedbacksResponseSchema.parse({
        items: items
      })
    );
  });

  app.get("/api/admin/evaluations", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listRunEvaluations({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      offset: 0
    });

    return c.json(
      adminEvaluationsResponseSchema.parse({
        items: items
      })
    );
  });
}
