import { type Hono } from "hono";
import { type WorkerEnv } from "../types.js";
import { type WorkerRouteContext } from "./routeContext.js";
import { adminTasksResponseSchema, adminTaskSchema } from "@personal-agent/shared";

export function registerAdminTaskRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  app.get("/api/admin/tasks", async (c) => {
    const ownerId = await context.adminOwnerId(c);
    if (!ownerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repositories = context.repositories(c.env);
    const tasks = await repositories.listTasks({
      ownerTgUserId: ownerId,
      limit: 50
    });

    return c.json(
      adminTasksResponseSchema.parse({
        items: tasks.map(task => ({
          id: task.id,
          ownerTgUserId: task.ownerTgUserId,
          type: task.type,
          status: task.status,
          title: task.title,
          command: task.command,
          contextJson: task.contextJson,
          resultJson: task.resultJson,
          error: task.error,
          runId: task.runId,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          completedAt: task.completedAt
        }))
      })
    );
  });

  app.get("/api/admin/tasks/:id", async (c) => {
    const ownerId = await context.adminOwnerId(c);
    if (!ownerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const repositories = context.repositories(c.env);
    const task = await repositories.getTask({
      ownerTgUserId: ownerId,
      id
    });

    if (!task) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(
      adminTaskSchema.parse({
        id: task.id,
        ownerTgUserId: task.ownerTgUserId,
        type: task.type,
        status: task.status,
        title: task.title,
        command: task.command,
        contextJson: task.contextJson,
        resultJson: task.resultJson,
        error: task.error,
        runId: task.runId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt
      })
    );
  });

  app.delete("/api/admin/tasks/:id", async (c) => {
    const ownerId = await context.adminOwnerId(c);
    if (!ownerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const repositories = context.repositories(c.env);
    
    await repositories.deleteTask({
      ownerTgUserId: ownerId,
      id
    });

    return c.json({ success: true });
  });

  app.post("/api/admin/tasks/:id/cancel", async (c) => {
    const ownerId = await context.adminOwnerId(c);
    if (!ownerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const repositories = context.repositories(c.env);
    const runtime = context.runtime(c.env);
    const now = runtime.now();

    const task = await repositories.getTask({
      ownerTgUserId: ownerId,
      id
    });

    if (!task) {
      return c.json({ error: "Not found" }, 404);
    }

    if (task.status === "queued" || task.status === "running") {
      await repositories.updateTask({
        ownerTgUserId: ownerId,
        id,
        patch: {
          status: "cancelled",
          completedAt: now
        },
        updatedAt: now
      });
    }

    return c.json({ success: true });
  });
}
