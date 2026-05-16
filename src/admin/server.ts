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
    hostname: "127.0.0.1"
  });

  console.log(`Admin API is running on http://127.0.0.1:${env.ADMIN_PORT}/admin`);

  return server;
}
