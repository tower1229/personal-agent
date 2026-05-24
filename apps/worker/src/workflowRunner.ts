import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { type BotRuntime } from "./bot.js";
import { createD1Repositories } from "./d1Repositories.js";
import { createBraveSearchClient, createUrlFetcher } from "./externalTools.js";
import {
  createOpenAiCompatibleClient,
  normalizeLlmBaseUrl,
  parseMaxToolRounds
} from "./llm.js";
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

function fetchUrlMaxBytes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "200000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200000;
}

export class WorkflowSkillRunner extends WorkflowEntrypoint<
  WorkerEnv,
  WorkflowSkillPayload
> {
  async run(event: Readonly<WorkflowEvent<WorkflowSkillPayload>>, step: WorkflowStep) {
    const llmBaseUrl = normalizeLlmBaseUrl(this.env.LLM_API_BASE_URL);
    const runtime: BotRuntime = {
      repositories: createD1Repositories(this.env.DB),
      telegramClient: createTelegramClient({
        botToken: this.env.TELEGRAM_BOT_TOKEN
      }),
      llmClient:
        llmBaseUrl && this.env.LLM_API_KEY?.trim() && this.env.LLM_MODEL?.trim()
          ? createOpenAiCompatibleClient({
              apiBaseUrl: llmBaseUrl,
              apiKey: this.env.LLM_API_KEY,
              model: this.env.LLM_MODEL
            })
          : undefined,
      searchClient: this.env.BRAVE_SEARCH_API_KEY?.trim()
        ? createBraveSearchClient({ apiKey: this.env.BRAVE_SEARCH_API_KEY })
        : undefined,
      urlFetcher: createUrlFetcher({
        defaultMaxBytes: fetchUrlMaxBytes(this.env.FETCH_URL_MAX_BYTES)
      }),
      maxToolRounds: parseMaxToolRounds(this.env.LLM_MAX_TOOL_ROUNDS),
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
