import { Hono } from "hono";
import {
  adminApprovalsResponseSchema,
  adminAuthConfigResponseSchema,
  adminHealthResponseSchema,
  adminMemoriesResponseSchema,
  adminMeResponseSchema,
  adminApiSuccessSchema,
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
} from "./auth.js";
import { handleOwnerUpdate } from "./bot.js";
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
      runtime: {
        repositories: repositories(c.env),
        telegramClient:
          options.telegramClient ??
          createTelegramClient({
            botToken: c.env.TELEGRAM_BOT_TOKEN
          }),
        now: options.now ?? Date.now,
        generateId: options.generateId ?? defaultGenerateId,
        generateApprovalCode:
          options.generateApprovalCode ?? defaultGenerateApprovalCode
      }
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
