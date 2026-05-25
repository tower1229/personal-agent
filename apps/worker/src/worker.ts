import { createWorkerApp, runScheduled } from "./app.js";
import { WorkflowSkillRunner } from "./workflowRunner.js";

const app = createWorkerApp();

export { WorkflowSkillRunner };

export default {
  fetch(request: Request, env: Parameters<typeof runScheduled>[0], ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled(
    controller: ScheduledController,
    env: Parameters<typeof runScheduled>[0],
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(runScheduled(env, {}, controller.scheduledTime));
  }
};
