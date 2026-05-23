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
  adminRunsResponseSchema,
  adminTodosResponseSchema,
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
  type AgentRepositories,
  type ApprovalRequestRecord,
  type MemoryRecord,
  type RunRecord,
  type SkillRecord,
  type SkillRouteDecisionRecord,
  type SkillRunRecord,
  type TodoRecord
} from "./repositories.js";

function ownerId(env: WorkerEnv): number {
  return Number.parseInt(env.OWNER_TG_USER_ID, 10);
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

interface WorkerAppOptions {
  repositories?: AgentRepositories;
  telegramClient?: ReturnType<typeof createTelegramClient>;
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
        options.generateApprovalCode ?? defaultGenerateApprovalCode
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
        botUsername: c.env.TELEGRAM_BOT_USERNAME
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
    if (manifest.kind !== "chat") {
      return c.json({ error: "Workflow skills cannot be published yet" }, 400);
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
    const result = await executeSkill({
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
