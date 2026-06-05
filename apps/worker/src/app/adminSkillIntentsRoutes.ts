import {
  adminApiSuccessSchema,
  adminAssistRequestSchema,
  adminAssistResponseSchema,
  adminSkillIntentCreateRequestSchema,
  adminSkillIntentsResponseSchema,
  adminSkillRoutingExamplesBatchCreateRequestSchema
} from "@personal-agent/shared";
import { type Hono } from "hono";
import { AdminLlmAssistService } from "../adminLlmAssist.js";
import { skillRoutingExamplesGenerateCapability } from "../adminLlmCapabilities/skillRoutingExamplesGenerate.js";
import { type WorkerEnv } from "../types.js";
import { defaultGenerateId } from "./helpers.js";
import { type WorkerRouteContext } from "./routeContext.js";

const assistService = new AdminLlmAssistService();
assistService.register(skillRoutingExamplesGenerateCapability);


export function registerAdminSkillIntentsRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { options, repositories, adminOwnerId } = context;

  app.get("/api/admin/skill-intents", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
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
    const authenticatedOwnerId = await adminOwnerId(c);
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
      skillId: null,
      skillName: body.data.skillName,
      intentText: body.data.intentText,
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    return c.json(item, 201);
  });

  app.delete("/api/admin/skill-intents/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await repositories(c.env).deleteSkillIntent({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/skills/:id/routing-examples/generate", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminAssistRequestSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const targetId = c.req.param("id");
    const result = await assistService.run(
      {
        env: c.env,
        repositories: repositories(c.env),
        ownerTgUserId: authenticatedOwnerId
      },
      "skill_routing_examples.generate",
      targetId,
      body.data.options ?? { instruction: body.data.instruction }
    );

    const runRecord = await repositories(c.env).getAdminAssistRun({
      id: result.assistRunId,
      ownerTgUserId: authenticatedOwnerId
    });

    if (!runRecord) {
      return c.json({ error: "Assist run created but not found" }, 500);
    }

    return c.json(
      adminAssistResponseSchema.parse({
        assistRun: runRecord,
        draft: result.draft,
        warnings: result.warnings,
        trace: {
          promptVersion: runRecord.promptVersion,
          contextSummary: runRecord.contextSummary
        }
      }),
      201
    );
  });

  app.post("/api/admin/skills/:id/routing-examples", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminSkillRoutingExamplesBatchCreateRequestSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const targetId = c.req.param("id");
    const skill = await repositories(c.env).getSkill({
      ownerTgUserId: authenticatedOwnerId,
      id: targetId
    });

    if (!skill) {
      return c.json({ error: "Skill not found" }, 404);
    }

    const existingIntents = await repositories(c.env).listSkillIntents(
      authenticatedOwnerId
    );
    
    // Normalize existing intents for duplicate check
    const existingTexts = new Set(
      existingIntents
        .filter((i) => i.skillId === targetId || i.skillName === skill.name)
        .map((i) => i.intentText.trim().toLowerCase())
    );

    const now = (options.now ?? Date.now)();
    const newRecords = body.data.items
      .filter((item) => !existingTexts.has(item.exampleText.trim().toLowerCase()))
      .map((item) => ({
        id: (options.generateId ?? defaultGenerateId)(),
        ownerTgUserId: authenticatedOwnerId,
        skillId: skill.id,
        skillName: skill.name,
        intentText: item.exampleText,
        status: "active" as const,
        createdAt: now,
        updatedAt: now
      }));

    if (newRecords.length > 0) {
      await repositories(c.env).createSkillIntentsBatch(newRecords);
    }
    
    if (body.data.assistRunId) {
      await repositories(c.env).updateAdminAssistRun({
        id: body.data.assistRunId,
        ownerTgUserId: authenticatedOwnerId,
        status: "applied"
      });
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }), 201);
  });
}
