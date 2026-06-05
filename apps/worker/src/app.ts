import { Hono } from "hono";
import { getCookieValue, getSessionCookieName, verifySession } from "./auth.js";
import { type BotRuntime } from "./bot.js";
import { createD1Repositories } from "./d1Repositories.js";
import {
  createBraveSearchClient,
  createUrlFetcher,
  type SearchClient,
  type UrlFetcher
} from "./externalTools.js";
import {
  createOpenAiCompatibleClient,
  normalizeLlmBaseUrl,
  parseMaxToolRounds,
  type LlmClient
} from "./llm.js";

import { type AgentRepositories } from "./repositories.js";
import { pollDueSchedules } from "./schedules.js";
import { createTelegramClient } from "./telegram.js";
import { checkDueTodos } from "./todos-cron.js";
import { type WorkerEnv } from "./types.js";

import { defaultGenerateApprovalCode, defaultGenerateId, ownerId } from "./app/helpers.js";
import { registerWorkerRoutes } from "./app/routes.js";

interface WorkerAppOptions {
  repositories?: AgentRepositories;
  telegramClient?: ReturnType<typeof createTelegramClient>;
  llmClient?: LlmClient;
  searchClient?: SearchClient;
  urlFetcher?: UrlFetcher;
  now?: () => number;
  generateId?: () => string;
  generateApprovalCode?: () => string;
}

export function createWorkerApp(options: WorkerAppOptions = {}) {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  function repositories(env: WorkerEnv): AgentRepositories {
    return options.repositories ?? createD1Repositories(env.DB);
  }

  function fetchUrlMaxBytes(env: WorkerEnv): number {
    const parsed = Number.parseInt(env.FETCH_URL_MAX_BYTES ?? "200000", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 200000;
  }

  function llmClient(env: WorkerEnv): LlmClient | undefined {
    if (options.llmClient) {
      return options.llmClient;
    }
    const baseUrl = normalizeLlmBaseUrl(env.LLM_API_BASE_URL);
    const apiKey = env.LLM_API_KEY?.trim();
    const model = env.LLM_MODEL?.trim();
    if (!baseUrl || !apiKey || !model) {
      return undefined;
    }
    return createOpenAiCompatibleClient({
      apiBaseUrl: baseUrl,
      apiKey,
      model
    });
  }

  function searchClient(env: WorkerEnv): SearchClient | undefined {
    if (options.searchClient) {
      return options.searchClient;
    }
    const apiKey = env.BRAVE_SEARCH_API_KEY?.trim();
    return apiKey ? createBraveSearchClient({ apiKey }) : undefined;
  }

  function runtime(env: WorkerEnv): BotRuntime {
    return {
      repositories: repositories(env),
      telegramClient:
        options.telegramClient ??
        createTelegramClient({
          botToken: env.TELEGRAM_BOT_TOKEN
        }),
      llmClient: llmClient(env),
      searchClient: searchClient(env),
      urlFetcher:
        options.urlFetcher ??
        createUrlFetcher({
          defaultMaxBytes: fetchUrlMaxBytes(env)
        }),
      maxToolRounds: parseMaxToolRounds(env.LLM_MAX_TOOL_ROUNDS),
      now: options.now ?? Date.now,
      generateId: options.generateId ?? defaultGenerateId,
      generateApprovalCode:
        options.generateApprovalCode ?? defaultGenerateApprovalCode,
      env
    };
  }

  async function adminOwnerId(c: {
    req: { header: (name: string) => string | undefined };
    env: WorkerEnv;
  }): Promise<number | null> {
    const session = await verifySession({
      cookieValue: getCookieValue(
        c.req.header("cookie") ?? null,
        getSessionCookieName()
      ),
      secret: c.env.ADMIN_SESSION_SECRET
    });

    if (!session || session.id !== ownerId(c.env)) {
      return null;
    }

    return session.id;
  }

  registerWorkerRoutes(app, {
    options,
    repositories,
    fetchUrlMaxBytes,
    llmClient,
    searchClient,
    runtime,
    adminOwnerId
  });

  return app;
}

export async function runScheduled(
  env: WorkerEnv,
  options: WorkerAppOptions = {},
  scheduledTime = Date.now()
) {
  const runtime: BotRuntime = {
      repositories: options.repositories ?? createD1Repositories(env.DB),
      telegramClient:
        options.telegramClient ??
        createTelegramClient({
          botToken: env.TELEGRAM_BOT_TOKEN
        }),
      llmClient:
        options.llmClient ??
        (normalizeLlmBaseUrl(env.LLM_API_BASE_URL) &&
        env.LLM_API_KEY?.trim() &&
        env.LLM_MODEL?.trim()
          ? createOpenAiCompatibleClient({
              apiBaseUrl: normalizeLlmBaseUrl(env.LLM_API_BASE_URL) as string,
              apiKey: env.LLM_API_KEY,
              model: env.LLM_MODEL
            })
          : undefined),
      searchClient:
        options.searchClient ??
        (env.BRAVE_SEARCH_API_KEY?.trim()
          ? createBraveSearchClient({ apiKey: env.BRAVE_SEARCH_API_KEY })
          : undefined),
      urlFetcher:
        options.urlFetcher ??
        createUrlFetcher({
          defaultMaxBytes: (() => {
            const parsed = Number.parseInt(
              env.FETCH_URL_MAX_BYTES ?? "200000",
              10
            );
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 200000;
          })()
        }),
      maxToolRounds: parseMaxToolRounds(env.LLM_MAX_TOOL_ROUNDS),
      now: options.now ?? Date.now,
      generateId: options.generateId ?? defaultGenerateId,
      generateApprovalCode:
        options.generateApprovalCode ?? defaultGenerateApprovalCode,
      env
    };
  const [schedules, todosCron] = await Promise.all([
    pollDueSchedules({
      now: scheduledTime,
      runtime
    }),
    checkDueTodos({
      now: scheduledTime,
      runtime
    })
  ]);

  return {
    ...schedules,
    ...todosCron
  };
}
