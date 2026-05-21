import { env } from "../config/env.js";
import { markRunSucceeded } from "../db/runs.js";
import { type DocumentSourceType, type Job } from "../db/schema.js";
import { runEval } from "../eval/runEval.js";
import { retriever } from "../rag/index.js";
import { ingestDocument } from "../services/documentIngestion.js";
import { processUserTextMessageJob } from "../services/messageHandler.js";
import { type LlmClient } from "../llm/types.js";
import { finishRunProgress, getRunProgress } from "./progress.js";

function parsePayload(job: Job): Record<string, unknown> {
  const parsed = JSON.parse(job.payloadJson) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Job ${job.id} payload is not an object`);
  }

  return parsed as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Job payload field ${field} is required`);
  }

  return value;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function sourceTypeValue(value: unknown): DocumentSourceType {
  return value === "markdown" ? "markdown" : "text";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processJob(
  job: Job,
  input: { llmClient?: LlmClient } = {}
): Promise<void> {
  const payload = parsePayload(job);

  switch (job.type) {
    case "handle_text_message": {
      if (!job.runId) {
        throw new Error("handle_text_message job requires runId");
      }

      const progress = getRunProgress(job.runId);
      const result = await processUserTextMessageJob({
        runId: job.runId,
        message: stringValue(payload.message, "message"),
        userId: job.userId,
        chatId: job.chatId,
        metadata: recordValue(payload.metadata),
        onProgress: progress?.onProgress,
        llmClient: input.llmClient
      });

      await finishRunProgress(job.runId, result.output);
      return;
    }
    case "ingest_document": {
      if (!job.runId) {
        throw new Error("ingest_document job requires runId");
      }

      const startedAt = Date.now();
      const metadata = recordValue(payload.metadata);

      const result = await ingestDocument({
        userId: job.userId,
        title: stringValue(payload.title, "title"),
        content: stringValue(payload.content, "content"),
        sourceType: sourceTypeValue(payload.sourceType),
        metadata: {
          ...metadata,
          chatId: job.chatId,
          runId: job.runId
        }
      });
      const output = result.skippedDuplicate
        ? "这个文档之前已经导入过，已跳过重复导入。"
        : [
            `已导入文档：${result.title}`,
            `切分片段：${result.chunkCount}`,
            "文档索引已进入后台任务，完成前仍可使用关键词检索。"
          ].join("\n");

      await markRunSucceeded({
        id: job.runId,
        output,
        latencyMs: Date.now() - startedAt,
        metadata
      });
      await finishRunProgress(job.runId, output);

      return;
    }
    case "index_document_chunks":
      await retriever.indexDocument({
        userId: job.userId,
        documentId: Number(payload.documentId)
      });
      return;
    case "run_eval":
      await runEval({
        useMock: payload.mock === true
      });
      return;
  }

  throw new Error(`Unsupported job type: ${String(job.type)}`);
}

export function isRetryableJobError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();

  return (
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes(env.OPENAI_MODEL.toLowerCase())
  );
}
