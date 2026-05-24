import { Hono } from "hono";
import {
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminHealthResponseSchema,
  adminMemoriesResponseSchema,
  adminMeResponseSchema,
  adminApiSuccessSchema,
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
} from "./auth.js";
import { executeSkill, handleOwnerUpdate, type BotRuntime } from "./bot.js";
import { createD1Repositories } from "./d1Repositories.js";
import {
  createTelegramClient,
  getTelegramUpdateUserId,
  parseTelegramUpdate
} from "./telegram.js";
import { type WorkerEnv } from "./types.js";
import {
  executeScheduleCommand,
  nextScheduleRunAt,
  normalizeScheduleRequest,
  pollDueSchedules
} from "./schedules.js";
import { unsupportedWorkflowStepTypes } from "./workflowValidation.js";
import {
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
  type ScheduleExecutionRecord,
  type ScheduleRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type TodoRecord,
  type WorkflowRunRecord,
  type WorkflowStepRecord
} from "./repositories.js";

function ownerId(env: WorkerEnv): number {
  return Number.parseInt(env.OWNER_TG_USER_ID, 10);
}

function telegramBotUsername(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^@/, "") ?? "";

  if (
    normalized.length < 5 ||
    normalized.length > 32 ||
    !/^[A-Za-z0-9_]+$/.test(normalized) ||
    !normalized.toLowerCase().endsWith("bot")
  ) {
    return null;
  }

  return normalized;
}

function defaultGenerateId(): string {
  return crypto.randomUUID();
}

function defaultGenerateApprovalCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

function limitParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

function toAdminRun(run: RunRecord) {
  return {
    id: run.id,
    status: run.status,
    messageText: run.messageText,
    responseText: run.responseText,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function toAdminTodo(todo: TodoRecord) {
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    createdAt: todo.createdAt,
    completedAt: todo.completedAt
  };
}

function toAdminMemory(memory: MemoryRecord) {
  return {
    id: memory.id,
    content: memory.content,
    status: memory.status,
    createdAt: memory.createdAt,
    deletedAt: memory.deletedAt
  };
}

function toAdminApproval(approval: ApprovalRequestRecord) {
  return {
    id: approval.id,
    action: approval.action,
    status: approval.status,
    code: approval.code,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt
  };
}

function toAdminSkill(skill: SkillRecord) {
  return {
    id: skill.id,
    name: skill.draftManifest.name,
    description: skill.draftManifest.description,
    kind: skill.draftManifest.kind,
    enabled: skill.enabled,
    deleted: skill.deletedAt !== null,
    publishedVersionId: skill.publishedVersionId,
    updatedAt: skill.updatedAt
  };
}

function toAdminSkillDetail(skill: SkillRecord) {
  return {
    id: skill.id,
    manifest: skill.draftManifest,
    enabled: skill.enabled,
    deleted: skill.deletedAt !== null,
    publishedVersionId: skill.publishedVersionId,
    publishedVersion: skill.publishedVersion,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt
  };
}

function toAdminSkillRun(skillRun: SkillRunRecord) {
  return {
    id: skillRun.id,
    runId: skillRun.runId,
    skillId: skillRun.skillId,
    skillVersionId: skillRun.skillVersionId,
    status: skillRun.status,
    inputText: skillRun.inputText,
    outputText: skillRun.outputText,
    error: skillRun.error,
    createdAt: skillRun.createdAt,
    updatedAt: skillRun.updatedAt
  };
}

function toAdminSkillRouteDecision(decision: SkillRouteDecisionRecord) {
  return {
    id: decision.id,
    runId: decision.runId,
    triggerType: decision.triggerType,
    matchedSkillId: decision.matchedSkillId,
    matchedSkillVersionId: decision.matchedSkillVersionId,
    inputText: decision.inputText,
    reason: decision.reason,
    createdAt: decision.createdAt
  };
}

function toAdminWorkflowRun(workflowRun: WorkflowRunRecord) {
  return {
    id: workflowRun.id,
    runId: workflowRun.runId,
    skillId: workflowRun.skillId,
    skillVersionId: workflowRun.skillVersionId,
    source: workflowRun.source,
    status: workflowRun.status,
    inputText: workflowRun.inputText,
    outputText: workflowRun.outputText,
    error: workflowRun.error,
    createdAt: workflowRun.createdAt,
    updatedAt: workflowRun.updatedAt
  };
}

function toAdminWorkflowStep(workflowStep: WorkflowStepRecord) {
  return {
    id: workflowStep.id,
    workflowRunId: workflowStep.workflowRunId,
    stepId: workflowStep.stepId,
    stepType: workflowStep.stepType,
    status: workflowStep.status,
    inputJson: workflowStep.inputJson,
    outputJson: workflowStep.outputJson,
    error: workflowStep.error,
    startedAt: workflowStep.startedAt,
    completedAt: workflowStep.completedAt,
    createdAt: workflowStep.createdAt
  };
}

function toAdminSchedule(schedule: ScheduleRecord) {
  return {
    id: schedule.id,
    name: schedule.name,
    commandText: schedule.commandText,
    enabled: schedule.enabled,
    timezone: schedule.timezone,
    cadence: schedule.cadence,
    timeOfDay: schedule.timeOfDay,
    daysOfWeek: schedule.daysOfWeek,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

function toAdminScheduleExecution(execution: ScheduleExecutionRecord) {
  return {
    id: execution.id,
    scheduleId: execution.scheduleId,
    runId: execution.runId,
    scheduledFor: execution.scheduledFor,
    status: execution.status,
    outputText: execution.outputText,
    error: execution.error,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt
  };
}

interface WorkerAppOptions {
  repositories?: AgentRepositories;
  telegramClient?: ReturnType<typeof createTelegramClient>;
  workflowStarter?: BotRuntime["workflowStarter"];
  now?: () => number;
  generateId?: () => string;
  generateApprovalCode?: () => string;
}

export function createWorkerApp(options: WorkerAppOptions = {}) {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  function repositories(env: WorkerEnv): AgentRepositories {
    return options.repositories ?? createD1Repositories(env.DB);
  }

  function runtime(env: WorkerEnv): BotRuntime {
    return {
      repositories: repositories(env),
      telegramClient:
        options.telegramClient ??
        createTelegramClient({
          botToken: env.TELEGRAM_BOT_TOKEN
        }),
      now: options.now ?? Date.now,
      generateId: options.generateId ?? defaultGenerateId,
      generateApprovalCode:
        options.generateApprovalCode ?? defaultGenerateApprovalCode,
      workflowStarter: options.workflowStarter ?? env.WORKFLOW_SKILL_RUNNER
    };
  }

  async function adminOwnerId(c: {
    req: { header: (name: string) => string | undefined };
    env: WorkerEnv;
  }): Promise<number | null> {
    const session = await verifySession({
      cookieValue: getCookieValue(
        c.req.header("cookie") ?? null,
        getSessionCookieName()
      ),
      secret: c.env.ADMIN_SESSION_SECRET
    });

    if (!session || session.id !== ownerId(c.env)) {
      return null;
    }

    return session.id;
  }

  app.get("/api/admin/health", (c) =>
    c.json(
      adminHealthResponseSchema.parse({
        ok: true,
        service: "personal-agent-worker"
      })
    )
  );

  app.get("/api/admin/auth-config", (c) =>
    c.json(
      adminAuthConfigResponseSchema.parse({
        botUsername: telegramBotUsername(c.env.TELEGRAM_BOT_USERNAME),
        configured: telegramBotUsername(c.env.TELEGRAM_BOT_USERNAME) !== null
      })
    )
  );

  app.get("/api/admin/me", async (c) => {
    const session = await verifySession({
      cookieValue: getCookieValue(
        c.req.header("cookie") ?? null,
        getSessionCookieName()
      ),
      secret: c.env.ADMIN_SESSION_SECRET
    });

    if (!session) {
      return c.json(adminMeResponseSchema.parse({ authenticated: false }));
    }

    return c.json(
      adminMeResponseSchema.parse({
        authenticated: true,
        user: session
      })
    );
  });

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

  app.get("/api/admin/workflow-runs", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listWorkflowRuns(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminWorkflowRunsResponseSchema.parse({
        items: items.map(toAdminWorkflowRun)
      })
    );
  });

  app.get("/api/admin/workflow-runs/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const workflowRun = await repositories(c.env).getWorkflowRun({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!workflowRun) {
      return c.json({ error: "Workflow run not found" }, 404);
    }

    const steps = await repositories(c.env).listWorkflowSteps(workflowRun.id);

    return c.json(
      adminWorkflowRunDetailResponseSchema.parse({
        workflowRun: toAdminWorkflowRun(workflowRun),
        steps: steps.map(toAdminWorkflowStep)
      })
    );
  });

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

  app.post("/api/admin/logout", (c) => {
    c.header("Set-Cookie", buildExpiredSessionCookie());
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

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

  app.post("/telegram/webhook", async (c) => {
    const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET;

    if (
      !webhookSecret ||
      c.req.header("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret
    ) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const update = parseTelegramUpdate(await c.req.json().catch(() => null));

    if (!update) {
      return c.json({ error: "Invalid Telegram update" }, 400);
    }

    const userId = getTelegramUpdateUserId(update);

    if (userId !== ownerId(c.env)) {
      return c.json(
        telegramWebhookResponseSchema.parse({
          ok: true,
          ignored: true
        })
      );
    }

    const result = await handleOwnerUpdate({
      update,
      ownerTgUserId: userId,
      runtime: runtime(c.env)
    });

    return c.json(
      telegramWebhookResponseSchema.parse({
        ok: true,
        accepted: true,
        runId: result.runId
      })
    );
  });

  app.notFound((c) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }

    return c.text("Not Found", 404);
  });

  return app;
}

export async function runScheduled(
  env: WorkerEnv,
  options: WorkerAppOptions = {},
  scheduledTime = Date.now()
) {
  return pollDueSchedules({
    now: scheduledTime,
    runtime: {
      repositories: options.repositories ?? createD1Repositories(env.DB),
      telegramClient:
        options.telegramClient ??
        createTelegramClient({
          botToken: env.TELEGRAM_BOT_TOKEN
        }),
      now: options.now ?? Date.now,
      generateId: options.generateId ?? defaultGenerateId,
      generateApprovalCode:
        options.generateApprovalCode ?? defaultGenerateApprovalCode,
      workflowStarter: options.workflowStarter ?? env.WORKFLOW_SKILL_RUNNER
    }
  });
}
