import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { createJob, claimNextJob, getJob, markJobFailed } from "../src/db/jobs.js";
import { createRunningRun, getRun } from "../src/db/runs.js";
import {
  documentChunkEmbeddings,
  documents,
  jobs
} from "../src/db/schema.js";
import { createJobWorker } from "../src/jobs/worker.js";
import { createMockLlmClient } from "../src/llm/mockClient.js";
import { ingestDocument } from "../src/services/documentIngestion.js";
import { searchDocumentChunks } from "../src/db/documents.js";
import { enqueueUserTextMessage } from "../src/services/messageHandler.js";
import { retriever } from "../src/rag/index.js";

describe("job queue", () => {
  it("deduplicates jobs by idempotency key", async () => {
    const first = await createJob({
      type: "run_eval",
      userId: "job-user",
      chatId: "job-chat",
      idempotencyKey: "same-key",
      payload: {
        evalRunId: 1
      }
    });
    const second = await createJob({
      type: "run_eval",
      userId: "job-user",
      chatId: "job-chat",
      idempotencyKey: "same-key",
      payload: {
        evalRunId: 1
      }
    });

    expect(second.id).toBe(first.id);
    expect(await db.select().from(jobs)).toHaveLength(1);
  });

  it("claims each pending job once", async () => {
    await createJob({
      type: "run_eval",
      userId: "job-user",
      chatId: "job-chat",
      idempotencyKey: "claim-key",
      payload: {
        evalRunId: 1
      }
    });

    const first = await claimNextJob("worker-a");
    const second = await claimNextJob("worker-b");

    expect(first?.status).toBe("running");
    expect(first?.attempts).toBe(1);
    expect(second).toBeNull();
  });

  it("reclaims stale running jobs before they exhaust attempts", async () => {
    const job = await createJob({
      type: "run_eval",
      userId: "job-user",
      chatId: "job-chat",
      idempotencyKey: "stale-running-key",
      maxAttempts: 2,
      payload: {
        evalRunId: 1
      }
    });

    await claimNextJob("worker-a");
    await db
      .update(jobs)
      .set({
        lockedAt: new Date(Date.now() - 10 * 60 * 1000)
      })
      .where(eq(jobs.id, job.id));

    const reclaimed = await claimNextJob("worker-b", {
      lockTimeoutMs: 1_000
    });

    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(2);
    expect(reclaimed?.lockedBy).toBe("worker-b");
  });

  it("fails stale running terminal jobs and closes the run", async () => {
    const run = await createRunningRun({
      userId: "stale-terminal-user",
      chatId: "stale-terminal-chat",
      model: "mock",
      input: "你好",
      metadata: {
        source: "unit-test"
      },
      createdAt: new Date()
    });
    const job = await createJob({
      type: "handle_text_message",
      userId: run.userId,
      chatId: run.chatId,
      runId: run.id,
      idempotencyKey: "stale-terminal-key",
      maxAttempts: 1,
      payload: {
        message: "你好",
        metadata: {
          source: "unit-test"
        }
      }
    });

    await claimNextJob("worker-a");
    await db
      .update(jobs)
      .set({
        lockedAt: new Date(Date.now() - 10 * 60 * 1000)
      })
      .where(eq(jobs.id, job.id));

    const worker = createJobWorker({
      workerId: "terminal-sweep-worker"
    });

    expect(await worker.processOnce()).toBe(true);
    expect((await getJob(job.id))?.status).toBe("failed");
    expect((await getRun(run.id))?.status).toBe("failed");
  });

  it("requeues retryable failures until max attempts", async () => {
    const job = await createJob({
      type: "run_eval",
      userId: "job-user",
      chatId: "job-chat",
      idempotencyKey: "retry-key",
      maxAttempts: 2,
      payload: {
        evalRunId: 1
      }
    });

    await claimNextJob("worker-a");
    const retry = await markJobFailed(job.id, new Error("connection error"), {
      retryable: true,
      delayMs: 0
    });

    expect(retry.status).toBe("pending");

    await claimNextJob("worker-a");
    const terminal = await markJobFailed(job.id, new Error("connection error"), {
      retryable: true,
      delayMs: 0
    });

    expect(terminal.status).toBe("failed");
    expect(terminal.attempts).toBe(2);
  });

  it("worker completes queued text message runs", async () => {
    const run = await createRunningRun({
      userId: "job-text-user",
      chatId: "job-text-chat",
      model: "mock",
      input: "你好",
      metadata: {
        source: "unit-test"
      },
      createdAt: new Date()
    });

    await createJob({
      type: "handle_text_message",
      userId: run.userId,
      chatId: run.chatId,
      runId: run.id,
      idempotencyKey: "text-job",
      payload: {
        message: "你好",
        metadata: {
          source: "unit-test"
        }
      }
    });

    const worker = createJobWorker({
      workerId: "test-worker",
      llmClient: createMockLlmClient({
        behavior: "plain_text",
        plainText: "worker done"
      })
    });

    expect(await worker.processOnce()).toBe(true);
    expect((await getRun(run.id))?.status).toBe("succeeded");
    expect((await getRun(run.id))?.output).toBe("worker done");
  });

  it("retries transient text job failures without failing the run immediately", async () => {
    const run = await createRunningRun({
      userId: "job-retry-user",
      chatId: "job-retry-chat",
      model: "mock",
      input: "你好",
      metadata: {
        source: "unit-test"
      },
      createdAt: new Date()
    });
    const job = await createJob({
      type: "handle_text_message",
      userId: run.userId,
      chatId: run.chatId,
      runId: run.id,
      idempotencyKey: "text-retry-job",
      payload: {
        message: "你好",
        metadata: {
          source: "unit-test"
        }
      }
    });
    const worker = createJobWorker({
      workerId: "retry-worker",
      llmClient: {
        async createChatCompletion() {
          throw new Error("connection error");
        }
      }
    });

    expect(await worker.processOnce()).toBe(true);
    expect((await getJob(job.id))?.status).toBe("pending");
    expect((await getRun(run.id))?.status).toBe("running");
  });

  it("deduplicates enqueued Telegram messages without leaving the duplicate run active", async () => {
    const first = await enqueueUserTextMessage({
      input: "你好",
      userId: "dedupe-user",
      chatId: "dedupe-chat",
      metadata: {
        telegram_message_id: 1
      },
      idempotencyKey: "telegram:dedupe-chat:1"
    });
    const second = await enqueueUserTextMessage({
      input: "你好",
      userId: "dedupe-user",
      chatId: "dedupe-chat",
      metadata: {
        telegram_message_id: 1
      },
      idempotencyKey: "telegram:dedupe-chat:1"
    });

    expect(second.reusedExistingJob).toBe(true);
    expect(second.runId).toBe(first.runId);
    expect(await db.select().from(jobs)).toHaveLength(1);
  });
});

describe("RAG indexing jobs", () => {
  it("indexes document embeddings in the worker", async () => {
    const previousDisableEmbeddings = process.env.DISABLE_EMBEDDINGS;
    const previousEvalMock = process.env.EVAL_MOCK;

    process.env.DISABLE_EMBEDDINGS = "0";
    process.env.EVAL_MOCK = "1";

    try {
      const result = await ingestDocument({
        userId: "rag-index-user",
        title: "Index Doc",
        content: "Admin API 使用 Hono，base path 是 /admin。",
        sourceType: "text",
        metadata: {
          chatId: "rag-index-chat"
        }
      });
      const before = await db
        .select()
        .from(documents)
        .where(eq(documents.id, result.documentId))
        .limit(1);

      expect(before[0]?.indexStatus).toBe("pending");

      const worker = createJobWorker({
        workerId: "rag-worker"
      });

      expect(await worker.processOnce()).toBe(true);

      const after = await db
        .select()
        .from(documents)
        .where(eq(documents.id, result.documentId))
        .limit(1);

      expect(after[0]?.indexStatus).toBe("indexed");
      expect(await db.select().from(documentChunkEmbeddings)).toHaveLength(1);
    } finally {
      if (typeof previousDisableEmbeddings === "undefined") {
        delete process.env.DISABLE_EMBEDDINGS;
      } else {
        process.env.DISABLE_EMBEDDINGS = previousDisableEmbeddings;
      }

      if (typeof previousEvalMock === "undefined") {
        delete process.env.EVAL_MOCK;
      } else {
        process.env.EVAL_MOCK = previousEvalMock;
      }
    }
  });

  it("keeps keyword fallback usable when embedding indexing fails", async () => {
    const result = await ingestDocument({
      userId: "rag-fallback-user",
      title: "Fallback Doc",
      content: "Trace Integrity 的核心指标是 runId 全链路贯穿。",
      sourceType: "text",
      metadata: {
        chatId: "rag-fallback-chat"
      }
    });
    const worker = createJobWorker({
      workerId: "rag-fallback-worker"
    });

    expect(await worker.processOnce()).toBe(true);

    const documentRows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, result.documentId))
      .limit(1);
    const chunks = await searchDocumentChunks({
      userId: "rag-fallback-user",
      query: "Trace Integrity runId",
      limit: 5
    });

    expect(documentRows[0]?.indexStatus).toBe("failed");
    expect(chunks[0]?.sourceTitle).toBe("Fallback Doc");
    expect(chunks[0]?.retrievalMode).toBe("keyword_fallback");
  });

  it("ensures duplicate pending documents still have an index job", async () => {
    await ingestDocument({
      userId: "rag-duplicate-user",
      title: "Duplicate Pending",
      content: "重复文档索引任务应该保持存在。",
      sourceType: "text",
      metadata: {
        chatId: "rag-duplicate-chat"
      }
    });
    await ingestDocument({
      userId: "rag-duplicate-user",
      title: "Duplicate Pending Copy",
      content: "重复文档索引任务应该保持存在。",
      sourceType: "text",
      metadata: {
        chatId: "rag-duplicate-chat"
      }
    });

    expect(await db.select().from(jobs)).toHaveLength(1);
    expect((await db.select().from(jobs))[0]?.type).toBe("index_document_chunks");
  });

  it("deletes document chunks and embeddings through retriever", async () => {
    const previousDisableEmbeddings = process.env.DISABLE_EMBEDDINGS;
    const previousEvalMock = process.env.EVAL_MOCK;

    process.env.DISABLE_EMBEDDINGS = "0";
    process.env.EVAL_MOCK = "1";

    try {
      const result = await ingestDocument({
        userId: "rag-delete-user",
        title: "Delete Doc",
        content: "需要删除的文档内容。",
        sourceType: "text",
        metadata: {
          chatId: "rag-delete-chat"
        }
      });
      const worker = createJobWorker({
        workerId: "rag-delete-worker"
      });

      await worker.processOnce();
      await retriever.deleteDocument({
        userId: "rag-delete-user",
        documentId: result.documentId
      });

      expect(await db.select().from(documents)).toHaveLength(0);
      expect(await db.select().from(documentChunkEmbeddings)).toHaveLength(0);
    } finally {
      if (typeof previousDisableEmbeddings === "undefined") {
        delete process.env.DISABLE_EMBEDDINGS;
      } else {
        process.env.DISABLE_EMBEDDINGS = previousDisableEmbeddings;
      }

      if (typeof previousEvalMock === "undefined") {
        delete process.env.EVAL_MOCK;
      } else {
        process.env.EVAL_MOCK = previousEvalMock;
      }
    }
  });
});
