import { type Hono } from "hono";
import { buildSessionCookie, signSession, verifyTelegramLogin } from "../auth.js";
import { type WorkerEnv } from "../types.js";
import { ownerId } from "./helpers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerAuthRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  _context: WorkerRouteContext
) {
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
