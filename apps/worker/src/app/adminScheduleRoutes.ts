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

export function registerAdminScheduleRoutes(
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

  app.get("/api/admin/schedules", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listSchedules(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminSchedulesResponseSchema.parse({
        items: items.map(toAdminSchedule)
      })
    );
  });

  app.post("/api/admin/schedules", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminScheduleUpsertRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid schedule" }, 400);
    }

    const normalized = normalizeScheduleRequest(body.data);
    const now = (options.now ?? Date.now)();
    const schedule = await repositories(c.env).createSchedule({
      id: (options.generateId ?? defaultGenerateId)(),
      ownerTgUserId: authenticatedOwnerId,
      name: normalized.name,
      commandText: normalized.commandText,
      enabled: normalized.enabled,
      timezone: normalized.timezone,
      cadence: normalized.cadence,
      timeOfDay: normalized.timeOfDay,
      daysOfWeek: normalized.daysOfWeek,
      nextRunAt: nextScheduleRunAt({
        cadence: normalized.cadence,
        timeOfDay: normalized.timeOfDay,
        daysOfWeek: normalized.daysOfWeek,
        after: now
      }),
      lastRunAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });

    return c.json(
      adminScheduleSchema.parse(toAdminSchedule(schedule)),
      201
    );
  });

  app.put("/api/admin/schedules/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminScheduleUpsertRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid schedule" }, 400);
    }

    const normalized = normalizeScheduleRequest(body.data);
    const now = (options.now ?? Date.now)();
    const schedule = await repositories(c.env).updateSchedule({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      name: normalized.name,
      commandText: normalized.commandText,
      enabled: normalized.enabled,
      timezone: normalized.timezone,
      cadence: normalized.cadence,
      timeOfDay: normalized.timeOfDay,
      daysOfWeek: normalized.daysOfWeek,
      nextRunAt: nextScheduleRunAt({
        cadence: normalized.cadence,
        timeOfDay: normalized.timeOfDay,
        daysOfWeek: normalized.daysOfWeek,
        after: now
      }),
      updatedAt: now
    });
    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    return c.json(adminScheduleSchema.parse(toAdminSchedule(schedule)));
  });

  app.post("/api/admin/schedules/:id/enable", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const current = await repositories(c.env).getSchedule({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!current) {
      return c.json({ error: "Schedule not found" }, 404);
    }
    const now = (options.now ?? Date.now)();
    await repositories(c.env).setScheduleEnabled({
      ownerTgUserId: authenticatedOwnerId,
      id: current.id,
      enabled: true,
      nextRunAt: nextScheduleRunAt({
        cadence: current.cadence,
        timeOfDay: current.timeOfDay,
        daysOfWeek: current.daysOfWeek,
        after: now
      }),
      updatedAt: now
    });

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/schedules/:id/disable", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const current = await repositories(c.env).getSchedule({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!current) {
      return c.json({ error: "Schedule not found" }, 404);
    }
    await repositories(c.env).setScheduleEnabled({
      ownerTgUserId: authenticatedOwnerId,
      id: current.id,
      enabled: false,
      nextRunAt: current.nextRunAt,
      updatedAt: (options.now ?? Date.now)()
    });

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/schedules/:id/run-now", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const schedule = await repositories(c.env).getSchedule({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }
    const rt = runtime(c.env);
    const execution = await rt.repositories.createScheduleExecution({
      id: rt.generateId(),
      scheduleId: schedule.id,
      ownerTgUserId: authenticatedOwnerId,
      runId: null,
      scheduledFor: rt.now(),
      status: "running",
      outputText: null,
      error: null,
      createdAt: rt.now(),
      updatedAt: rt.now()
    });
    if (!execution) {
      return c.json({ error: "Schedule execution already exists" }, 409);
    }

    await executeScheduleCommand({
      schedule,
      execution,
      runtime: rt
    });

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.delete("/api/admin/schedules/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const schedule = await repositories(c.env).softDeleteSchedule({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      deletedAt: (options.now ?? Date.now)()
    });
    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.get("/api/admin/schedule-executions", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listScheduleExecutions({
      ownerTgUserId: authenticatedOwnerId,
      scheduleId: c.req.query("scheduleId"),
      limit: limitParam(c.req.query("limit"))
    });

    return c.json(
      adminScheduleExecutionsResponseSchema.parse({
        items: items.map(toAdminScheduleExecution)
      })
    );
  });

}
