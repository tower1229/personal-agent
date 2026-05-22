import { getRun, markRunFailed } from "../db/runs.js";
import {
  claimNextJob,
  failExpiredRunningJobs,
  markJobFailed,
  markJobSucceeded
} from "../db/jobs.js";
import { type Job } from "../db/schema.js";
import { type LlmClient } from "../llm/types.js";
import { toErrorMessage } from "../utils/errors.js";
import { isRetryableJobError, processJob } from "./handlers.js";
import { finishRunProgress } from "./progress.js";

export interface JobWorker {
  start(): void;
  stop(): void;
  processOnce(): Promise<boolean>;
}

async function markRunFailedIfTerminal(job: Job, error: unknown): Promise<void> {
  if (!job.runId || !["handle_text_message", "ingest_document"].includes(job.type)) {
    return;
  }

  const run = await getRun(job.runId);
  const output =
    job.type === "ingest_document"
      ? "抱歉，文档导入失败。请稍后再试。"
      : "抱歉，我刚刚处理消息时遇到问题。请稍后再试。";

  await markRunFailed({
    id: job.runId,
    error: toErrorMessage(error),
    latencyMs: run ? Date.now() - run.createdAt.getTime() : 0,
    output: null
  }).catch((markError) => {
    console.error("Failed to mark run failed for terminal job:", markError);
  });
  await finishRunProgress(job.runId, output);
}

export function createJobWorker(input: {
  workerId?: string;
  intervalMs?: number;
  llmClient?: LlmClient;
} = {}): JobWorker {
  const workerId = input.workerId ?? `worker-${process.pid}`;
  const intervalMs = input.intervalMs ?? 1_000;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = true;

  async function processOnce(): Promise<boolean> {
    const expiredJobs = await failExpiredRunningJobs();

    for (const expiredJob of expiredJobs) {
      await markRunFailedIfTerminal(
        expiredJob,
        new Error(expiredJob.lastError ?? "Job lock expired after max attempts")
      );
    }

    if (expiredJobs.length) {
      return true;
    }

    const job = await claimNextJob(workerId);

    if (!job) {
      return false;
    }

    try {
      await processJob(job, {
        llmClient: input.llmClient
      });
      await markJobSucceeded(job.id);
    } catch (error) {
      const updated = await markJobFailed(job.id, error, {
        retryable: isRetryableJobError(error)
      });

      console.error(`Job ${job.id} failed:`, error);

      if (updated.status === "failed") {
        await markRunFailedIfTerminal(job, error);
      }
    }

    return true;
  }

  async function tick(): Promise<void> {
    if (running || stopped) {
      return;
    }

    running = true;

    try {
      while (!stopped && (await processOnce())) {
        // Drain currently available jobs before sleeping.
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) {
        return;
      }

      stopped = false;
      void tick();
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
    },
    stop() {
      stopped = true;

      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    processOnce
  };
}
