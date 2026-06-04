import { type Hono } from "hono";
import {
  adminApiSuccessSchema,
  adminLongTaskDetailResponseSchema,
  adminLongTasksResponseSchema
} from "@personal-agent/shared";
import {
  canCancelLongTask,
  canPauseLongTask,
  canResumeLongTask,
  executeLongTaskForRecord
} from "../longTasks.js";
import { type WorkerEnv } from "../types.js";
import { limitParam } from "./helpers.js";
import {
  toAdminLongTask,
  toAdminLongTaskEvent,
  toAdminLongTaskStep
} from "./serializers.js";
import { type WorkerRouteContext } from "./routeContext.js";

export function registerAdminLongTaskRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { repositories, runtime, adminOwnerId } = context;

  app.get("/api/admin/long-tasks", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await repositories(c.env).listLongTasks(
      authenticatedOwnerId,
      limitParam(c.req.query("limit"))
    );

    return c.json(
      adminLongTasksResponseSchema.parse({
        items: items.map(toAdminLongTask)
      })
    );
  });

  app.get("/api/admin/long-tasks/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repo = repositories(c.env);
    const task = await repo.getLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!task) {
      return c.json({ error: "Long task not found" }, 404);
    }

    const [steps, events] = await Promise.all([
      repo.listLongTaskSteps(task.id),
      repo.listLongTaskEvents(task.id)
    ]);

    return c.json(
      adminLongTaskDetailResponseSchema.parse({
        task: toAdminLongTask(task),
        steps: steps.map(toAdminLongTaskStep),
        events: events.map(toAdminLongTaskEvent)
      })
    );
  });

  app.post("/api/admin/long-tasks/:id/pause", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const repo = repositories(c.env);
    const task = await repo.getLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!task) {
      return c.json({ error: "Long task not found" }, 404);
    }
    if (!canPauseLongTask(task)) {
      return c.json({ error: `Long task status ${task.status} cannot be paused` }, 409);
    }
    const rt = runtime(c.env);
    await repo.updateLongTask({
      id: task.id,
      status: "paused",
      currentStepId: task.currentStepId,
      outputText: task.outputText,
      error: task.error,
      updatedAt: rt.now()
    });
    await repo.createLongTaskEvent({
      id: rt.generateId(),
      longTaskId: task.id,
      ownerTgUserId: authenticatedOwnerId,
      stepId: null,
      eventType: "paused",
      payloadJson: JSON.stringify({ source: "admin" }),
      createdAt: rt.now()
    });
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/long-tasks/:id/resume", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const repo = repositories(c.env);
    const task = await repo.getLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!task) {
      return c.json({ error: "Long task not found" }, 404);
    }
    if (!canResumeLongTask(task)) {
      return c.json({ error: `Long task status ${task.status} cannot be resumed` }, 409);
    }
    const rt = runtime(c.env);
    const steps = await repo.listLongTaskSteps(task.id);
    const blocked = steps.find((step) => step.status === "blocked");
    if (blocked) {
      await repo.updateLongTaskStep({
        id: blocked.id,
        status: "skipped",
        outputJson: JSON.stringify({ skippedByUserConfirmation: true }),
        error: null,
        completedAt: rt.now()
      });
    }
    const runningTask = {
      ...task,
      status: "running" as const,
      error: null,
      updatedAt: rt.now()
    };
    await repo.updateLongTask({
      id: task.id,
      status: "running",
      currentStepId: task.currentStepId,
      outputText: task.outputText,
      error: null,
      updatedAt: rt.now()
    });
    await repo.createLongTaskEvent({
      id: rt.generateId(),
      longTaskId: task.id,
      ownerTgUserId: authenticatedOwnerId,
      stepId: blocked?.id ?? null,
      eventType: "resumed",
      payloadJson: JSON.stringify({ source: "admin" }),
      createdAt: rt.now()
    });
    await executeLongTaskForRecord({
      runtime: rt,
      task: runningTask,
      notifyOnCompletion: true
    });
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.post("/api/admin/long-tasks/:id/cancel", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const repo = repositories(c.env);
    const task = await repo.getLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!task) {
      return c.json({ error: "Long task not found" }, 404);
    }
    if (!canCancelLongTask(task)) {
      return c.json({ error: `Long task status ${task.status} cannot be cancelled` }, 409);
    }
    const rt = runtime(c.env);
    await repo.updateLongTask({
      id: task.id,
      status: "cancelled",
      currentStepId: task.currentStepId,
      outputText: task.outputText,
      error: "Admin cancelled",
      updatedAt: rt.now()
    });
    await repo.createLongTaskEvent({
      id: rt.generateId(),
      longTaskId: task.id,
      ownerTgUserId: authenticatedOwnerId,
      stepId: null,
      eventType: "cancelled",
      payloadJson: JSON.stringify({ source: "admin" }),
      createdAt: rt.now()
    });
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

  app.delete("/api/admin/long-tasks/:id", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const repo = repositories(c.env);
    const task = await repo.getLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: c.req.param("id")
    });
    if (!task) {
      return c.json({ error: "Long task not found" }, 404);
    }
    await repo.deleteLongTask({
      ownerTgUserId: authenticatedOwnerId,
      id: task.id
    });
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });
}
