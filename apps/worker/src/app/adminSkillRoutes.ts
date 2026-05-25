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

export function registerAdminSkillRoutes(
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

  app.get("/api/admin/skills", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listSkills(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminSkillsResponseSchema.parse({
        items: items.map(toAdminSkill)
      })
    );
  });

  app.post("/api/admin/skills", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminSkillUpsertRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid skill manifest" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const skill = await repositories(c.env).createSkill({
      ownerTgUserId: authenticatedOwnerId,
      manifest: body.data.manifest,
      createdAt: now
    });

    return c.json(
      adminSkillDetailResponseSchema.parse({
        skill: toAdminSkillDetail(skill)
      }),
      201
    );
  });

  app.get("/api/admin/skills/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skill = await repositories(c.env).getSkill({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(
      adminSkillDetailResponseSchema.parse({
        skill: toAdminSkillDetail(skill)
      })
    );
  });

  app.put("/api/admin/skills/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminSkillUpsertRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success || body.data.manifest.id !== c.req.param("id")) {
      return c.json({ error: "Invalid skill manifest" }, 400);
    }

    const skill = await repositories(c.env).updateSkillDraft({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      manifest: body.data.manifest,
      updatedAt: (options.now ?? Date.now)()
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(
      adminSkillDetailResponseSchema.parse({
        skill: toAdminSkillDetail(skill)
      })
    );
  });

  app.post("/api/admin/skills/:id/publish", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skill = await repositories(c.env).getSkill({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }
    const manifest = skillManifestSchema.parse(skill.draftManifest);
    if (manifest.kind === "workflow") {
      const unsupported = unsupportedWorkflowStepTypes(manifest);
      if (unsupported.length > 0) {
        return c.json(
          { error: `Unsupported workflow step types: ${unsupported.join(", ")}` },
          400
        );
      }
      const unauthorized = unauthorizedWorkflowStepTools(manifest);
      if (unauthorized.length > 0) {
        return c.json(
          {
            error: `Workflow steps require allowed tools: ${unauthorized.join(", ")}`
          },
          400
        );
      }
    }

    const version = await repositories(c.env).publishSkill({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      versionId: (options.generateId ?? defaultGenerateId)(),
      createdAt: (options.now ?? Date.now)()
    });
    if (!version) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(
      adminSkillPublishResponseSchema.parse({
        ok: true,
        versionId: version.id,
        version: version.version
      })
    );
  });

  app.post("/api/admin/skills/:id/enable", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skill = await repositories(c.env).setSkillEnabled({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      enabled: true,
      updatedAt: (options.now ?? Date.now)()
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/skills/:id/disable", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skill = await repositories(c.env).setSkillEnabled({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      enabled: false,
      updatedAt: (options.now ?? Date.now)()
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.delete("/api/admin/skills/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skill = await repositories(c.env).softDeleteSkill({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id"),
      deletedAt: (options.now ?? Date.now)()
    });
    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/skills/:id/test-run", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminSkillTestRunRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid test input" }, 400);
    }

    const runnable = await repositories(c.env).getRunnableSkillById({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!runnable || runnable.version.manifest.kind !== "chat") {
      return c.json({ error: "Runnable chat skill not found" }, 404);
    }

    const rt = runtime(c.env);
    const now = rt.now();
    const run = await rt.repositories.createRun({
      id: rt.generateId(),
      ownerTgUserId: authenticatedOwnerId,
      chatId: authenticatedOwnerId,
      updateId: null,
      messageText: body.data.input,
      createdAt: now,
      updatedAt: now
    });
    await rt.repositories.createSkillRouteDecision({
      id: rt.generateId(),
      runId: run.id,
      ownerTgUserId: authenticatedOwnerId,
      inputText: body.data.input,
      triggerType: "explicit_id",
      matchedSkillId: runnable.skill.id,
      matchedSkillVersionId: runnable.version.id,
      confidence: 1,
      reason: "admin test run",
      createdAt: rt.now()
    });
    let result: Awaited<ReturnType<typeof executeSkill>>;
    try {
      result = await executeSkill({
        runId: run.id,
        ownerTgUserId: authenticatedOwnerId,
        match: {
          runnable,
          inputText: body.data.input,
          triggerType: "explicit_id",
          reason: "admin test run"
        },
        runtime: rt
      });
      await rt.repositories.updateRun(run.id, {
        status: "succeeded",
        responseText: result.responseText,
        error: null,
        updatedAt: rt.now()
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Skill test run failed";
      await rt.repositories.recordToolCall({
        id: rt.generateId(),
        runId: run.id,
        ownerTgUserId: authenticatedOwnerId,
        toolName: "skill_test_run",
        riskLevel: "read",
        status: "failed",
        inputJson: JSON.stringify({ input: body.data.input }),
        outputJson: null,
        error: message,
        createdAt: rt.now()
      });
      await rt.repositories.updateRun(run.id, {
        status: "failed",
        responseText: null,
        error: message,
        updatedAt: rt.now()
      });
      return c.json({ error: message }, 500);
    }

    return c.json(
      adminSkillTestRunResponseSchema.parse({
        ok: true,
        runId: run.id,
        skillRunId: result.skillRunId,
        output: result.responseText
      })
    );
  });

  app.get("/api/admin/skill-runs", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listSkillRuns(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminSkillRunsResponseSchema.parse({
        items: items.map(toAdminSkillRun)
      })
    );
  });

  app.get("/api/admin/skill-route-decisions", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listSkillRouteDecisions(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminSkillRouteDecisionsResponseSchema.parse({
        items: items.map(toAdminSkillRouteDecision)
      })
    );
  });

}
