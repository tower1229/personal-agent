import { type Hono } from "hono";
import { type WorkerEnv } from "../types.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerFallbackRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  _context: WorkerRouteContext
) {
  app.notFound((c) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }

    return c.text("Not Found", 404);
  });
}
