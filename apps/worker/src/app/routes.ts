import { type Hono } from "hono";
import { type WorkerEnv } from "../types.js";
import { registerAdminDataRoutes } from "./adminDataRoutes.js";
import { registerAdminLongTaskRoutes } from "./adminLongTaskRoutes.js";
import { registerAdminPersonalModelRoutes } from "./adminPersonalModelRoutes.js";
import { registerAdminScheduleRoutes } from "./adminScheduleRoutes.js";
import { registerAdminSkillRoutes } from "./adminSkillRoutes.js";
import { registerAdminSkillIntentsRoutes } from "./adminSkillIntentsRoutes.js";
import { registerAdminSystemRoutes } from "./adminSystemRoutes.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerFallbackRoutes } from "./fallbackRoutes.js";
import { registerTelegramRoutes } from "./telegramRoutes.js";
import { type WorkerRouteContext } from "./routeContext.js";

export function registerWorkerRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  registerAdminSystemRoutes(app, context);
  registerAdminDataRoutes(app, context);
  registerAdminLongTaskRoutes(app, context);
  registerAdminPersonalModelRoutes(app, context);
  registerAdminSkillRoutes(app, context);
  registerAdminSkillIntentsRoutes(app, context);
  registerAdminScheduleRoutes(app, context);
  registerAuthRoutes(app, context);
  registerTelegramRoutes(app, context);
  registerFallbackRoutes(app, context);
}
