import { describe, expect, it } from "vitest";
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
          retrievalMode: "keyword_fallback"
        })
      ]
    });
  });
});
