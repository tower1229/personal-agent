import { type BotRuntime } from "../bot.js";
import { type AgentRepositories } from "../repositories.js";
import { type WorkerEnv } from "../types.js";

export interface WorkerRouteContext {
  options: {
    now?: () => number;
    generateId?: () => string;
    generateApprovalCode?: () => string;
  };
  repositories: (env: WorkerEnv) => AgentRepositories;
  fetchUrlMaxBytes: (env: WorkerEnv) => number;
  llmClient: (env: WorkerEnv) => BotRuntime["llmClient"];
  searchClient: (env: WorkerEnv) => BotRuntime["searchClient"];
  runtime: (env: WorkerEnv) => BotRuntime;
  adminOwnerId: (c: {
    req: { header: (name: string) => string | undefined };
    env: WorkerEnv;
  }) => Promise<number | null>;
}
