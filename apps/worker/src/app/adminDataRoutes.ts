import {
  adminApiSuccessSchema,
  adminApprovalsResponseSchema,
  adminEvaluationsResponseSchema,
  adminFeedbacksResponseSchema,
  adminMemoriesResponseSchema,
  adminMemoryCreateRequestSchema,
  adminMemorySchema,
  adminMemoryUpdateRequestSchema,
  adminRunDetailResponseSchema,
  adminRunsResponseSchema,
  adminTodoCreateRequestSchema,
  adminTodoSchema,
  adminTodosResponseSchema,
  adminTodoUpdateRequestSchema
} from "@personal-agent/shared";
import { type Hono } from "hono";
import { normalizeMemoryContent } from "../bot.js";
import { type WorkerEnv } from "../types.js";
import { limitParam } from "./helpers.js";
import {
  toAdminApproval,

  toAdminMemory,
  toAdminPlannerRouteDecision,
  toAdminRun,
  toAdminScheduleExecution,
  toAdminSkillRouteDecision,
  toAdminSkillRun,
  toAdminTodo,
  toAdminToolCall
} from "./serializers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerAdminDataRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { options, repositories, adminOwnerId } = context;

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

  app.get("/api/admin/runs/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repo = repositories(c.env);
    const run = await repo.getRun({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [
      toolCalls,
      skillRouteDecision,
      plannerRouteDecision,
      skillRun,

      scheduleExecution
    ] = await Promise.all([
      repo.listToolCallsForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getSkillRouteDecisionForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getPlannerRouteDecisionForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),
      repo.getSkillRunForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      }),

      repo.getScheduleExecutionForRun({
        ownerTgUserId: authenticatedOwnerId,
        runId: run.id
      })
    ]);

    return c.json(
      adminRunDetailResponseSchema.parse({
        run: toAdminRun(run),
        toolCalls: toolCalls.map(toAdminToolCall),
        skillRouteDecision: skillRouteDecision
          ? toAdminSkillRouteDecision(skillRouteDecision)
          : null,
        plannerRouteDecision: plannerRouteDecision
          ? toAdminPlannerRouteDecision(plannerRouteDecision)
          : null,
        skillRun: skillRun ? toAdminSkillRun(skillRun) : null,

        scheduleExecution: scheduleExecution
          ? toAdminScheduleExecution(scheduleExecution)
          : null
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

  app.post("/api/admin/todos", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminTodoCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const todo = await repositories(c.env).createTodo({
      ownerTgUserId: authenticatedOwnerId,
      title: body.data.title,
      createdAt: now,
      dueAt: body.data.dueAt ?? undefined
    });

    return c.json(adminTodoSchema.parse(toAdminTodo(todo)), 201);
  });

  app.put("/api/admin/todos/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ error: "Invalid todo id" }, 400);
    }

    const body = adminTodoUpdateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const now = (options.now ?? Date.now)();
    const todo = await repositories(c.env).updateTodo({
      ownerTgUserId: authenticatedOwnerId,
      id,
      title: body.data.title,
      status: body.data.status,
      dueAt: body.data.dueAt ?? null,
      now
    });

    if (!todo) {
      return c.json({ error: "Todo not found" }, 404);
    }

    return c.json(adminTodoSchema.parse(toAdminTodo(todo)));
  });

  app.delete("/api/admin/todos/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ error: "Invalid todo id" }, 400);
    }

    const success = await repositories(c.env).deleteTodo({
      ownerTgUserId: authenticatedOwnerId,
      id
    });

    if (!success) {
      return c.json({ error: "Todo not found or delete failed" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
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

  app.post("/api/admin/memories", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminMemoryCreateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const memory = await repositories(c.env).createMemory({
      ownerTgUserId: authenticatedOwnerId,
      content: body.data.content,
      normalizedContent: normalizeMemoryContent(body.data.content),
      createdAt: (options.now ?? Date.now)()
    });

    return c.json(adminMemorySchema.parse(toAdminMemory(memory)));
  });

  app.put("/api/admin/memories/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ error: "Invalid id" }, 400);
    }

    const body = adminMemoryUpdateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const memory = await repositories(c.env).updateMemory({
      ownerTgUserId: authenticatedOwnerId,
      id,
      content: body.data.content,
      normalizedContent: normalizeMemoryContent(body.data.content)
    });

    if (!memory) {
      return c.json({ error: "Memory not found" }, 404);
    }

    return c.json(adminMemorySchema.parse(toAdminMemory(memory)));
  });

  app.delete("/api/admin/memories/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ error: "Invalid id" }, 400);
    }

    const deleted = await repositories(c.env).deleteMemory({
      ownerTgUserId: authenticatedOwnerId,
      id
    });

    if (!deleted) {
      return c.json({ error: "Memory not found" }, 404);
    }

    return c.json(adminApiSuccessSchema.parse({ ok: true }));
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

  app.get("/api/admin/feedbacks", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listRunFeedbacks({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      offset: 0 // Simplification for now
    });

    return c.json(
      adminFeedbacksResponseSchema.parse({
        items: items
      })
    );
  });

  app.get("/api/admin/evaluations", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listRunEvaluations({
      ownerTgUserId: authenticatedOwnerId,
      limit: limitParam(c.req.query("limit")),
      offset: 0
    });

    return c.json(
      adminEvaluationsResponseSchema.parse({
        items: items
      })
    );
  });
}
