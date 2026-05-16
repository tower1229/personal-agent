import { createMiddleware } from "hono/factory";
import { env } from "../config/env.js";

export const adminAuth = createMiddleware(async (c, next) => {
  const authorization = c.req.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (token !== env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
