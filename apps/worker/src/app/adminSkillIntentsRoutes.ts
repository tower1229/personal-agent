import { type Hono } from "hono";
import {
  adminApiSuccessSchema,
  adminSkillIntentCreateRequestSchema,
  adminSkillIntentsResponseSchema
} from "@personal-agent/shared";
import { type WorkerEnv } from "../types.js";
import { ownerId, defaultGenerateId } from "./helpers.js";
import { type WorkerRouteContext } from "./routeContext.js";

export function registerAdminSkillIntentsRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { options, repositories } = context;

  app.get("/api/admin/skill-intents", async (c) => {
    const authenticatedOwnerId = ownerId(c.env);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listSkillIntents(
      authenticatedOwnerId
    );

    return c.json(
      adminSkillIntentsResponseSchema.parse({
        items
      })
    );
  });

  app.post("/api/admin/skill-intents", async (c) => {
    const authenticatedOwnerId = ownerId(c.env);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminSkillIntentCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid skill intent data" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const item = await repositories(c.env).createSkillIntent({
      id: (options.generateId ?? defaultGenerateId)(),
      ownerTgUserId: authenticatedOwnerId,
      skillName: body.data.skillName,
      intentText: body.data.intentText,
      createdAt: now,
      updatedAt: now
    });

    return c.json(item, 201);
  });

  app.delete("/api/admin/skill-intents/:id", async (c) => {
    const authenticatedOwnerId = ownerId(c.env);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await repositories(c.env).deleteSkillIntent({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });
}
