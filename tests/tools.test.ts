import { describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { listDocumentChunks } from "../src/db/documents.js";
import { deleteMemory, searchMemories } from "../src/db/memories.js";
import { memories } from "../src/db/schema.js";
import { executeRegisteredTool } from "../src/tools/registry.js";

const context = {
  userId: "tool-test-user",
  chatId: "tool-test-chat",
  runId: null
};

describe("registered tools", () => {
  it("creates, lists, and completes todos", async () => {
    const created = await executeRegisteredTool({
      toolName: "create_todo",
      argsJson: JSON.stringify({
        title: "写单元测试",
        due_at: null
      }),
      context
    });

    expect(created).toMatchObject({
      todo: {
        title: "写单元测试",
        status: "open"
      }
    });

    const listed = await executeRegisteredTool({
      toolName: "list_todos",
      argsJson: "{}",
      context
    });

    expect(listed).toMatchObject({
      todos: [expect.objectContaining({ title: "写单元测试" })]
    });

    const todoId = Number(
      (listed as { todos: Array<{ id: number }> }).todos[0]?.id
    );
    const completed = await executeRegisteredTool({
      toolName: "complete_todo",
      argsJson: JSON.stringify({ id: todoId }),
      context
    });

    expect(completed).toMatchObject({
      todo: {
        id: todoId,
        status: "completed"
      }
    });
  });

  it("saves and searches memory", async () => {
    await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "preference",
        content: "用户喜欢 TypeScript",
        confidence: 90,
        importance: 80,
        source: "unit-test"
      }),
      context
    });

    const result = await executeRegisteredTool({
      toolName: "search_memory",
      argsJson: JSON.stringify({
        keyword: "TypeScript",
        limit: 5
      }),
      context
    });

    expect(result).toMatchObject({
      query: "TypeScript",
      exactKeywordMatched: true,
      memories: [expect.objectContaining({ content: "用户喜欢 TypeScript" })]
    });
  });

  it("deduplicates exact memory saves and updates access count", async () => {
    const first = await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "preference",
        content: "用户喜欢 TypeScript。",
        confidence: 90,
        importance: 80,
        source: "unit-test"
      }),
      context
    });
    const second = await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "preference",
        content: " 用户喜欢 TypeScript! ",
        confidence: 90,
        importance: 80,
        source: "unit-test"
      }),
      context
    });
    const rows = await db.select().from(memories);

    expect(first).toMatchObject({ status: "created" });
    expect(second).toMatchObject({ status: "duplicate" });
    expect(rows.filter((memory) => memory.status === "active")).toHaveLength(1);
    expect(rows[0]?.accessCount).toBe(1);

    await executeRegisteredTool({
      toolName: "search_memory",
      argsJson: JSON.stringify({
        keyword: "TypeScript",
        limit: 5
      }),
      context
    });

    const afterSearch = await db.select().from(memories);
    expect(afterSearch[0]?.accessCount).toBe(2);
    expect(afterSearch[0]?.lastAccessedAt).toBeInstanceOf(Date);
  });

  it("merges semantic duplicate memories when embeddings are available", async () => {
    const previousDisableEmbeddings = process.env.DISABLE_EMBEDDINGS;
    const previousEvalMock = process.env.EVAL_MOCK;
    const semanticContext = {
      ...context,
      userId: "tool-test-semantic-memory-user"
    };

    process.env.DISABLE_EMBEDDINGS = "0";
    process.env.EVAL_MOCK = "1";

    try {
      await executeRegisteredTool({
        toolName: "save_memory",
        argsJson: JSON.stringify({
          type: "preference",
          content: "abcabcabcabc",
          confidence: 80,
          importance: 70,
          source: "unit-test"
        }),
        context: semanticContext
      });
      const second = await executeRegisteredTool({
        toolName: "save_memory",
        argsJson: JSON.stringify({
          type: "preference",
          content: "abcabcabcabcx",
          confidence: 80,
          importance: 70,
          source: "unit-test"
        }),
        context: semanticContext
      });
      const activeRows = (await db.select().from(memories)).filter(
        (memory) => memory.userId === semanticContext.userId && memory.status === "active"
      );

      expect(second).toMatchObject({ status: expect.stringMatching(/merged|updated/) });
      expect(activeRows).toHaveLength(1);
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

  it("does not return deleted memories from search", async () => {
    const saved = await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "note",
        content: "删除后不应返回的记忆",
        confidence: 80,
        importance: 70,
        source: "unit-test"
      }),
      context
    });
    const memoryId = (saved as { memory: { id: number } }).memory.id;

    await deleteMemory({
      userId: context.userId,
      id: memoryId,
      sourceRunId: null,
      reason: "unit-test"
    });

    const results = await searchMemories({
      userId: context.userId,
      keyword: "删除后不应返回",
      limit: 5,
      sourceRunId: null,
      reason: "unit-test"
    });
    const rows = await db.select().from(memories);

    expect(results).toEqual([]);
    expect(rows.find((memory) => memory.id === memoryId)?.status).toBe("deleted");
  });

  it("archives conflicting answer style preferences", async () => {
    await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "preference",
        content: "用户希望回答尽量详细",
        confidence: 80,
        importance: 70,
        source: "unit-test"
      }),
      context: {
        ...context,
        userId: "tool-test-conflict-memory-user"
      }
    });
    await executeRegisteredTool({
      toolName: "save_memory",
      argsJson: JSON.stringify({
        type: "preference",
        content: "用户希望回答尽量简洁",
        confidence: 80,
        importance: 70,
        source: "unit-test"
      }),
      context: {
        ...context,
        userId: "tool-test-conflict-memory-user"
      }
    });

    const rows = (await db.select().from(memories)).filter(
      (memory) => memory.userId === "tool-test-conflict-memory-user"
    );

    expect(rows.filter((memory) => memory.status === "active")).toHaveLength(1);
    expect(rows.filter((memory) => memory.status === "archived")).toHaveLength(1);
    expect(rows.find((memory) => memory.status === "archived")?.supersededByMemoryId).toBe(
      rows.find((memory) => memory.status === "active")?.id
    );
  });

  it("adds documents and searches via keyword fallback without embeddings", async () => {
    const addResult = await executeRegisteredTool({
      toolName: "add_document",
      argsJson: JSON.stringify({
        title: "Admin API 配置",
        content: "Admin API 使用 Hono，base path 是 /admin，需要 Bearer token。",
        sourceType: "text"
      }),
      context
    });

    expect(addResult).toMatchObject({
      title: "Admin API 配置",
      chunk_count: 1,
      duplicate: false
    });
    const chunks = await listDocumentChunks({
      documentId: (addResult as { document_id: number }).document_id,
      userId: context.userId
    });

    expect(chunks[0]?.metadataJson).toContain('"sourceTitle":"Admin API 配置"');
    expect(chunks[0]?.metadataJson).toContain('"sourceType":"text"');
    expect(chunks[0]?.metadataJson).toContain('"headingPath":[]');
    expect(chunks[0]?.metadataJson).toContain('"chunkType":"text_paragraph"');
    expect(chunks[0]?.metadataJson).toContain('"originalChunkLength"');

    const searchResult = await executeRegisteredTool({
      toolName: "search_documents",
      argsJson: JSON.stringify({
        query: "Admin API base path",
        limit: 5
      }),
      context
    });

    expect(searchResult).toMatchObject({
      retrievalMode: "keyword_fallback",
      chunks: [
        expect.objectContaining({
          sourceTitle: "Admin API 配置",
          rerankScore: expect.any(Number),
          rerankReasons: expect.any(Array),
          retrievalMode: "keyword_fallback"
        })
      ]
    });
  });

  it("returns no document chunks when there is no lexical evidence", async () => {
    await executeRegisteredTool({
      toolName: "add_document",
      argsJson: JSON.stringify({
        title: "Agent 项目范围",
        content: "本项目关注 Telegram Bot、Agent runtime、workflow 和 eval。",
        sourceType: "text"
      }),
      context
    });

    const searchResult = await executeRegisteredTool({
      toolName: "search_documents",
      argsJson: JSON.stringify({
        query: "火星农业预算",
        limit: 5
      }),
      context
    });

    expect(searchResult).toMatchObject({
      resultCount: 0,
      chunks: []
    });
  });

  it("filters weak vector-only hybrid candidates", async () => {
    const previousDisableEmbeddings = process.env.DISABLE_EMBEDDINGS;
    const previousEvalMock = process.env.EVAL_MOCK;

    process.env.DISABLE_EMBEDDINGS = "0";
    process.env.EVAL_MOCK = "1";

    try {
      await executeRegisteredTool({
        toolName: "add_document",
        argsJson: JSON.stringify({
          title: "Workflow 范围",
          content: "Workflow 负责 daily brief、步骤状态和输出记录。",
          sourceType: "text"
        }),
        context: {
          ...context,
          userId: "tool-test-vector-filter-user"
        }
      });

      const searchResult = await executeRegisteredTool({
        toolName: "search_documents",
        argsJson: JSON.stringify({
          query: "orphan-vector-only-token",
          limit: 5
        }),
        context: {
          ...context,
          userId: "tool-test-vector-filter-user"
        }
      });

      expect(searchResult).toMatchObject({
        resultCount: 0,
        chunks: []
      });
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
