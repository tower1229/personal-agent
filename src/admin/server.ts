import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "../config/env.js";
import { adminAuth } from "./auth.js";
import { adminRoutes } from "./routes.js";

export function createAdminApp() {
  const app = new Hono().basePath("/admin");

  app.use("*", adminAuth);
  app.route("/", adminRoutes);

  return app;
}

export function startAdminServer() {
  const app = createAdminApp();

  const server = serve({
    fetch: app.fetch,
    port: env.ADMIN_PORT,
    hostname: env.ADMIN_HOST
  });

  console.log(`Admin API is running on http://${env.ADMIN_HOST}:${env.ADMIN_PORT}/admin`);

  return server;
}
