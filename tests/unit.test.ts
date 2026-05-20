import { describe, expect, it } from "vitest";
import { buildProgressText, formatProgressEventLine } from "../src/bot/progressUpdater.js";
import {
  calculateDocumentRetrievalScore,
  normalizeDocumentKeywordScore,
  scoreDocumentChunkKeywords,
  tokenizeDocumentQuery
} from "../src/db/documents.js";
import { cosineSimilarity } from "../src/services/embeddings.js";
import { splitDocumentIntoChunks } from "../src/services/chunking.js";
import { rerankDocumentChunks } from "../src/services/rerank.js";
import {
  buildCanonicalKey,
  normalizeMemoryContent
} from "../src/services/memoryNormalization.js";
import { parseApprovalDecision } from "../src/services/messageHandler.js";
import { prettyJson } from "../src/admin/ui/formatters.js";
import {
  renderEvalDetailPage,
  renderMemoryDetailPage,
  renderRunDetailPage,
  renderRunsPage
} from "../src/admin/ui/pages.js";
import { createMockLlmClient } from "../src/llm/mockClient.js";
import { validateSearchDocumentResultShape } from "../src/eval/scoring.js";
import { sanitizeTelegramText } from "../src/utils/sanitizeTelegramText.js";

describe("unit helpers", () => {
  it("sanitizes Telegram markdown that the bot should not emit", () => {
    expect(sanitizeTelegramText("**重点** `code` 保留")).toBe("重点 code 保留");
    expect(sanitizeTelegramText("跨行 **不\n处理**")).toBe("跨行 **不\n处理**");
  });

  it("calculates cosine similarity deterministically", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("parses approval confirmation decisions", () => {
    expect(parseApprovalDecision("确认")).toEqual({
      type: "approve",
      code: null
    });
    expect(parseApprovalDecision("确认 1234")).toEqual({
      type: "approve",
      code: "1234"
    });
    expect(parseApprovalDecision("取消")).toEqual({ type: "reject" });
    expect(parseApprovalDecision("确认 1234 5678")).toBeNull();
    expect(parseApprovalDecision("好的")).toBeNull();
  });

  it("normalizes memory content and builds stable canonical keys", () => {
    const normalized = normalizeMemoryContent("  User LIKES TypeScript!!!  ");

    expect(normalized).toBe("user likes typescript");
    expect(normalizeMemoryContent("用户 喜欢 TypeScript。")).toBe(
      "用户 喜欢 typescript"
    );
    expect(
      buildCanonicalKey({
        type: "preference",
        normalizedContent: normalized
      })
    ).toBe(
      buildCanonicalKey({
        type: "preference",
        normalizedContent: "user likes typescript"
      })
    );
  });

  it("formats JSON safely for admin UI", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("{bad json")).toBe("{bad json");
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson(null)).toBe("");
  });

  it("renders admin UI with escaped user content and debug sections", () => {
    const runsHtml = renderRunsPage(
      [
        {
          id: 1,
          status: "succeeded",
          userId: "user<script>",
          input: "<img src=x onerror=alert(1)>",
          output: "safe output",
          latencyMs: 12,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ],
      { userId: "user<script>", status: "succeeded", q: "<bad>", limit: 10 }
    );

    expect(runsHtml).toContain("filter-form");
    expect(runsHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(runsHtml).not.toContain("<img src=x");

    const detailHtml = renderRunDetailPage({
      run: {
        id: 1,
        status: "succeeded",
        userId: "u",
        chatId: "c",
        model: "m",
        input: "根据知识库",
        output: "回答",
        latencyMs: 20,
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      },
      toolCalls: [
        {
          toolName: "search_documents",
          status: "succeeded",
          argsJson: { query: "Admin" },
          resultJson: {
            query: "Admin",
            retrievalMode: "keyword_fallback",
            resultCount: 1,
            chunks: [
              {
                sourceTitle: "Admin Doc",
                chunkIndex: 0,
                headingPath: ["Admin"],
                score: 1,
                rerankScore: 1,
                keywordScore: 1,
                vectorScore: 0,
                retrievalMode: "keyword_fallback",
                rerankReasons: ["keywordCoverage=1"],
                content: "<script>alert(1)</script>"
              }
            ]
          },
          latencyMs: 5,
          createdAt: new Date("2026-01-01T00:00:00.010Z")
        }
      ],
      approvalRequests: [],
      workflow: null,
      workflowSteps: []
    });

    expect(detailHtml).toContain("Trace Timeline");
    expect(detailHtml).toContain("RAG Debug");
    expect(detailHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const evalHtml = renderEvalDetailPage({
      evalRun: {
        id: 1,
        total: 1,
        passed: 0,
        failed: 1,
        passRate: 0,
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        finishedAt: new Date("2026-01-01T00:01:00.000Z")
      },
      results: [
        {
          caseId: "case<script>",
          category: "document_search",
          passed: false,
          input: "bad input",
          output: "bad output",
          scoreJson: {
            runId: 99,
            failureReasons: ["missing"]
          }
        }
      ]
    });

    expect(evalHtml).toContain("Debug Prompt");
    expect(evalHtml).toContain("/admin/ui/runs/99");
    expect(evalHtml).toContain("case&lt;script&gt;");

    const memoryHtml = renderMemoryDetailPage({
      memory: {
        id: 1,
        status: "active",
        type: "preference",
        userId: "u",
        content: "用户喜欢 TypeScript",
        normalizedContent: "用户喜欢 typescript",
        canonicalKey: "key",
        confidence: 90,
        importance: 70,
        accessCount: 1,
        lastAccessedAt: new Date("2026-01-01T00:00:00.000Z"),
        supersededByMemoryId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      events: [
        { id: 1, eventType: "created", sourceRunId: null, reason: null, createdAt: new Date() },
        { id: 2, eventType: "duplicate_detected", sourceRunId: null, reason: null, createdAt: new Date() },
        { id: 3, eventType: "merged", sourceRunId: null, reason: null, createdAt: new Date() },
        { id: 4, eventType: "deleted", sourceRunId: null, reason: null, createdAt: new Date() },
        { id: 5, eventType: "searched", sourceRunId: null, reason: null, createdAt: new Date() },
        { id: 6, eventType: "accessed", sourceRunId: null, reason: null, createdAt: new Date() }
      ],
      embeddings: []
    });

    expect(memoryHtml).toContain("memory_events");
    for (const eventType of [
      "created",
      "duplicate_detected",
      "merged",
      "deleted",
      "searched",
      "accessed"
    ]) {
      expect(memoryHtml).toContain(eventType);
    }
  });

  it("formats progress events into Telegram progress text", () => {
    expect(
      formatProgressEventLine({
        type: "tool_start",
        message: "调用工具",
        toolName: "create_todo"
      })
    ).toBe("调用工具：create_todo");

    expect(
      buildProgressText([
        { type: "status", message: "已创建运行记录" },
        {
          type: "tool_done",
          message: "工具完成",
          toolName: "create_todo",
          outcome: "succeeded"
        }
      ])
    ).toContain("- 工具完成：create_todo");
  });

  it("scores document retrieval helpers", () => {
    const tokens = tokenizeDocumentQuery("Admin API base path");

    expect(tokens).toContain("admin");
    expect(scoreDocumentChunkKeywords("Admin API uses /admin", tokens)).toBe(3);
    expect(normalizeDocumentKeywordScore(3, 4)).toBe(0.75);
    expect(
      calculateDocumentRetrievalScore({
        keywordScore: 0.5,
        vectorScore: 1,
        retrievalMode: "hybrid"
      })
    ).toBe(0.8);
    expect(
      calculateDocumentRetrievalScore({
        keywordScore: 0.5,
        vectorScore: 1,
        retrievalMode: "keyword_fallback"
      })
    ).toBe(0.5);
  });

  it("chunks markdown by heading path", () => {
    const chunks = splitDocumentIntoChunks({
      title: "RAG 说明",
      sourceType: "markdown",
      content: [
        "# Admin",
        "Admin API 使用 Hono。",
        "## Auth",
        "需要 Bearer token。",
        "## Paths",
        "base path 是 /admin。"
      ].join("\n")
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.metadata.headingPath).toEqual(["Admin"]);
    expect(chunks[1]?.metadata.headingPath).toEqual(["Admin", "Auth"]);
    expect(chunks[2]?.metadata.headingPath).toEqual(["Admin", "Paths"]);
    expect(chunks[2]?.metadata).toMatchObject({
      sourceTitle: "RAG 说明",
      sourceType: "markdown",
      chunkType: "markdown_section"
    });
  });

  it("does not split markdown code blocks", () => {
    const code = [
      "```ts",
      "export function handler() {",
      "  return 'abcdefghijklmnopqrstuvwxyz';",
      "}",
      "```"
    ].join("\n");
    const chunks = splitDocumentIntoChunks({
      title: "代码文档",
      sourceType: "markdown",
      content: ["# Example", "说明文字。", code, "后续说明文字。"].join("\n\n"),
      maxChunkLength: 40,
      chunkOverlap: 5
    });
    const codeChunk = chunks.find((chunk) => chunk.content.includes("```ts"));

    expect(codeChunk?.content).toBe(code);
    expect(codeChunk?.metadata.chunkType).toBe("code_block");
  });

  it("preserves overlap when plain text paragraph boundaries split chunks", () => {
    const chunks = splitDocumentIntoChunks({
      title: "Overlap",
      sourceType: "text",
      content: [
        "alpha beta gamma delta epsilon",
        "second paragraph starts here"
      ].join("\n\n"),
      maxChunkLength: 40,
      chunkOverlap: 7
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.content.startsWith("epsilon")).toBe(true);
  });

  it("reranks title matches above weaker candidates", () => {
    const [first] = rerankDocumentChunks({
      query: "Admin API base path",
      candidates: [
        {
          content: "path 是 /pay。",
          sourceTitle: "支付网关说明",
          score: 0.05,
          keywordScore: 0.05,
          vectorScore: 0
        },
        {
          content: "使用 Hono，需要 Bearer token。",
          sourceTitle: "Admin API 配置",
          score: 0.05,
          keywordScore: 0.05,
          vectorScore: 0
        }
      ],
      now: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(first?.sourceTitle).toBe("Admin API 配置");
    expect(first?.rerankReasons).toContain("titleMatch=0.5");
  });

  it("reranks exact phrase matches above higher base scores", () => {
    const [first] = rerankDocumentChunks({
      query: "runId 全链路贯穿",
      candidates: [
        {
          content: "Trace Integrity 的核心指标是 runId 全链路贯穿。",
          sourceTitle: "Trace Integrity 说明",
          score: 0.1,
          keywordScore: 0.2,
          vectorScore: 0
        },
        {
          content: "runId 用于关联 runs 和 tool calls。",
          sourceTitle: "运行记录说明",
          score: 0.25,
          keywordScore: 0.4,
          vectorScore: 0
        }
      ],
      now: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(first?.sourceTitle).toBe("Trace Integrity 说明");
    expect(first?.rerankReasons).toContain("exactPhraseMatch");
  });

  it("validates search_documents result shape for eval scoring", () => {
    expect(
      validateSearchDocumentResultShape({
        retrievalMode: "keyword_fallback",
        chunks: [
          {
            score: 1,
            rerankScore: 1,
            keywordScore: 1,
            vectorScore: 0,
            retrievalMode: "keyword_fallback",
            sourceTitle: "Doc",
            chunkIndex: 0,
            headingPath: [],
            rerankReasons: ["keywordCoverage=1"]
          }
        ]
      })
    ).toEqual([]);
    expect(
      validateSearchDocumentResultShape({
        retrievalMode: "keyword_fallback",
        chunks: [{ score: 1 }]
      })
    ).toContain("chunks[0].rerankScore is missing");
  });

  it("mock LLM exposes deterministic simulation modes", async () => {
    const empty = await createMockLlmClient({
      behavior: "empty_response"
    }).createChatCompletion({
      model: "mock",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      tool_choice: "auto",
      stream: false
    });
    const tool = await createMockLlmClient({
      behavior: "search_documents_tool_call"
    }).createChatCompletion({
      model: "mock",
      messages: [{ role: "user", content: "根据知识库查询" }],
      tools: [],
      tool_choice: "auto",
      stream: false
    });

    expect(empty.message?.content).toBe("");
    expect(tool.message?.tool_calls?.[0]?.function.name).toBe(
      "search_documents"
    );
  });
});
