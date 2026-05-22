import { Hono } from "hono";
import {
  adminAuthConfigResponseSchema,
  adminHealthResponseSchema,
  adminMeResponseSchema,
  adminApiSuccessSchema,
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
import {
  getTelegramUpdateUserId,
  parseTelegramUpdate
} from "./telegram.js";
import { type WorkerEnv } from "./types.js";

function ownerId(env: WorkerEnv): number {
  return Number.parseInt(env.OWNER_TG_USER_ID, 10);
}

export function createWorkerApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();

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

    return c.json(
      telegramWebhookResponseSchema.parse({
        ok: true,
        accepted: true
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
