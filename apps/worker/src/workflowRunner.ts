import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { type BotRuntime } from "./bot.js";
import { createD1Repositories } from "./d1Repositories.js";
import { createTelegramClient } from "./telegram.js";
import { type WorkerEnv, type WorkflowSkillPayload } from "./types.js";
import { executeWorkflowSkillRun } from "./workflowExecutor.js";

function generateId(): string {
  return crypto.randomUUID();
}

function generateApprovalCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

export class WorkflowSkillRunner extends WorkflowEntrypoint<
  WorkerEnv,
  WorkflowSkillPayload
> {
  async run(event: Readonly<WorkflowEvent<WorkflowSkillPayload>>, step: WorkflowStep) {
    const runtime: BotRuntime = {
      repositories: createD1Repositories(this.env.DB),
      telegramClient: createTelegramClient({
        botToken: this.env.TELEGRAM_BOT_TOKEN
      }),
      now: Date.now,
      generateId,
      generateApprovalCode
    };

    return executeWorkflowSkillRun({
      payload: event.payload,
      runtime,
      stepAdapter: {
        do: (name, callback) => step.do(name, async () => (await callback()) as never),
        sleep: (name, durationMs) => step.sleep(name, durationMs)
      }
    });
  }
}
