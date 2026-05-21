import { markRunFailed } from "../db/runs.js";
import {
  claimNextJob,
  markJobFailed,
  markJobSucceeded
} from "../db/jobs.js";
import { type Job } from "../db/schema.js";
import { type LlmClient } from "../llm/types.js";
import { isRetryableJobError, processJob } from "./handlers.js";
import { stopRunProgress } from "./progress.js";

export interface JobWorker {
  start(): void;
  stop(): void;
  processOnce(): Promise<boolean>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function markRunFailedIfTerminal(job: Job, error: unknown): Promise<void> {
  if (!job.runId || !["handle_text_message", "ingest_document"].includes(job.type)) {
    return;
  }

  await markRunFailed({
    id: job.runId,
    error: toErrorMessage(error),
    latencyMs: 0,
    output: null
  }).catch((markError) => {
    console.error("Failed to mark run failed for terminal job:", markError);
  });
  stopRunProgress(job.runId);
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
