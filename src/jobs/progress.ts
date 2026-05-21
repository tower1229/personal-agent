import { type TelegramProgressUpdater } from "../bot/progressUpdater.js";
import { type ProgressHandler } from "../services/progress.js";

export interface RunProgressSink {
  onProgress?: ProgressHandler;
  finish(output: string): Promise<void>;
  stop(): void;
}

const progressByRunId = new Map<number, RunProgressSink>();

export function registerRunProgress(
  runId: number,
  sink: RunProgressSink | TelegramProgressUpdater
): void {
  progressByRunId.set(runId, sink);
}

export function getRunProgress(runId: number): RunProgressSink | null {
  return progressByRunId.get(runId) ?? null;
}

export async function finishRunProgress(
  runId: number,
  output: string
): Promise<void> {
  const sink = progressByRunId.get(runId);

  if (!sink) {
    return;
  }

  try {
    await sink.finish(output);
  } finally {
    progressByRunId.delete(runId);
  }
}

export function stopRunProgress(runId: number): void {
  const sink = progressByRunId.get(runId);

  if (!sink) {
    return;
  }

  sink.stop();
  progressByRunId.delete(runId);
}
