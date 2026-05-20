import {
  type LlmChatCompletionInput,
  type LlmChatCompletionResult,
  type LlmClient,
  type LlmMessage,
  type LlmToolCall
} from "./types.js";

export type MockLlmBehavior =
  | "auto"
  | "empty_response"
  | "plain_text"
  | "tool_call"
  | "multi_tool_call"
  | "destructive_tool_call"
  | "search_documents_tool_call";

export interface MockLlmClientOptions {
  behavior?: MockLlmBehavior;
  plainText?: string;
}

let toolCallSequence = 0;

function nextToolCall(name: string, args: Record<string, unknown>): LlmToolCall {
  toolCallSequence += 1;

  return {
    id: `mock_tool_call_${toolCallSequence}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  };
}

function assistantToolCall(toolCall: LlmToolCall): LlmChatCompletionResult {
  return {
    message: {
      role: "assistant",
      content: null,
      tool_calls: [toolCall]
    }
  };
}

function assistantText(content: string): LlmChatCompletionResult {
  return {
    message: {
      role: "assistant",
      content
    }
  };
}

function latestUserText(messages: LlmMessage[]): string {
  const user = [...messages].reverse().find((message) => message.role === "user");
  return String(user?.content ?? "");
}

function hasSystemText(messages: LlmMessage[], keyword: string): boolean {
  return messages.some(
    (message) =>
      message.role === "system" && String(message.content ?? "").includes(keyword)
  );
}

function toolResults(messages: LlmMessage[]): Array<{
  name: string | null;
  result: unknown;
}> {
  const assistantCalls = new Map<string, string>();

  for (const message of messages) {
    for (const toolCall of message.tool_calls ?? []) {
      assistantCalls.set(toolCall.id, toolCall.function.name);
    }
  }

  return messages
    .filter((message) => message.role === "tool")
    .map((message) => {
      try {
        return {
          name: message.tool_call_id
            ? assistantCalls.get(message.tool_call_id) ?? null
            : null,
          result: JSON.parse(String(message.content ?? "null")) as unknown
        };
      } catch {
        return {
          name: message.tool_call_id
            ? assistantCalls.get(message.tool_call_id) ?? null
            : null,
          result: null
        };
      }
    });
}

function firstObjectArrayValue(result: unknown, key: string): unknown[] {
  if (!result || typeof result !== "object" || !(key in result)) {
    return [];
  }

  const value = (result as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function firstIdFromToolResult(result: unknown, key: string): number {
  const rows = firstObjectArrayValue(result, key);
  const first = rows[0];

  if (first && typeof first === "object" && "id" in first) {
    const id = Number((first as { id: unknown }).id);
    return Number.isFinite(id) ? id : 1;
  }

  return 1;
}

function textIncludesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function createAutoReply(input: LlmChatCompletionInput): LlmChatCompletionResult {
  const userText = latestUserText(input.messages);
  const results = toolResults(input.messages);
  const latestToolResult = results.at(-1);

  if (hasSystemText(input.messages, "daily brief 生成器")) {
    return assistantText(
      "今日简报：今日待办已整理，重要记忆和相关文档已纳入，建议优先完成当前待办并复盘进展。"
    );
  }

  if (latestToolResult) {
    if (latestToolResult.name === "list_todos") {
      const id = firstIdFromToolResult(latestToolResult.result, "todos");
      return assistantToolCall(
        nextToolCall("complete_todo", {
          id
        })
      );
    }

    if (latestToolResult.name === "search_memory") {
      const memories = firstObjectArrayValue(latestToolResult.result, "memories");
      const ids = memories
        .map((memory) =>
          memory && typeof memory === "object" && "id" in memory
            ? Number((memory as { id: unknown }).id)
            : null
        )
        .filter((id): id is number => Boolean(id));

      if (textIncludesAny(userText, ["删除", "删掉"])) {
        const args =
          textIncludesAny(userText, ["所有", "全部"]) && ids.length > 1
            ? { ids, reason: "mock destructive request" }
            : { id: ids[0] ?? 1, reason: "mock destructive request" };

        return assistantToolCall(nextToolCall("delete_memory", args));
      }

      const content = memories
        .map((memory) =>
          memory && typeof memory === "object" && "content" in memory
            ? String((memory as { content: unknown }).content)
            : ""
        )
        .filter(Boolean)
        .join("；");

      if (userText.includes("偏好") && content) {
        return assistantText(`偏好：${content}`);
      }

      return assistantText(content || "没有找到相关记忆。");
    }

    if (latestToolResult.name === "search_documents") {
      if (
        textIncludesAny(userText, [
          "火星农业",
          "Week 99",
          "量子芯片",
          "预算是多少"
        ]) &&
        !textIncludesAny(userText, ["经费"])
      ) {
        return assistantText("没有找到足够的已保存文档依据。");
      }

      const chunks = firstObjectArrayValue(latestToolResult.result, "chunks");
      const firstChunk = chunks[0];
      const sourceTitle =
        firstChunk && typeof firstChunk === "object" && "sourceTitle" in firstChunk
          ? String((firstChunk as { sourceTitle: unknown }).sourceTitle)
          : "未知文档";
      const chunkIndex =
        firstChunk && typeof firstChunk === "object" && "chunkIndex" in firstChunk
          ? String((firstChunk as { chunkIndex: unknown }).chunkIndex)
          : "0";
      const evidence = `\n依据：${sourceTitle} / chunk ${chunkIndex}`;
      const content = chunks
        .map((chunk) =>
          chunk && typeof chunk === "object" && "content" in chunk
            ? String((chunk as { content: unknown }).content)
            : ""
        )
        .join("\n");

      if (userText.includes("Week 8")) {
        return assistantText(`Week 8 要做 eval 系统、Docker 部署和项目收尾。${evidence}`);
      }

      if (userText.includes("Trace Integrity")) {
        return assistantText(`Trace Integrity 的核心指标是 runId 全链路贯穿。${evidence}`);
      }

      if (userText.includes("项目代号")) {
        return assistantText(`项目代号是 RIVER-100。${evidence}`);
      }

      if (userText.includes("经费")) {
        return assistantText(`项目经费总额为 12000 元。${evidence}`);
      }

      if (userText.includes("Webhook 回调地址")) {
        return assistantText(`Webhook 回调地址是 /telegram/webhook。${evidence}`);
      }

      if (userText.includes("发布窗口")) {
        return assistantText(`发布窗口是每周三 10:00。${evidence}`);
      }

      if (userText.includes("citation 测试值")) {
        return assistantText(`citation 测试值是 SOURCE-777。${evidence}`);
      }

      if (content.includes("/admin")) {
        return assistantText(`Admin API 的 base path 是 /admin。${evidence}`);
      }

      if (content.includes("eval") || content.includes("Docker")) {
        return assistantText(`Week 8 要做 eval 系统、Docker 部署和项目收尾。${evidence}`);
      }

      return assistantText(
        chunks.length ? "已根据保存文档找到相关信息。" : "没有找到相关信息。"
      );
    }

    if (latestToolResult.name === "complete_todo") {
      const result = latestToolResult.result;

      if (result && typeof result === "object" && "error" in result) {
        return assistantText("没有找到这个待办，无法完成。");
      }

      return assistantText("已完成待办。");
    }

    if (latestToolResult.name === "create_todo") {
      return assistantText("已创建待办。");
    }

    if (latestToolResult.name === "save_memory") {
      return assistantText("已记住。");
    }

    if (latestToolResult.name === "add_document") {
      return assistantText("文档已保存。");
    }

    if (latestToolResult.name === "delete_memory") {
      return assistantText("请回复 确认 <确认码> 或 取消。");
    }
  }

  if (textIncludesAny(userText, ["OPENAI_API_KEY", "API key", "密钥"])) {
    return assistantText("不能提供或泄露任何密钥。");
  }

  if (textIncludesAny(userText, ["完成 id 为 999999"])) {
    return assistantToolCall(nextToolCall("complete_todo", { id: 999999 }));
  }

  if (textIncludesAny(userText, ["创建一个待办", "新增待办", "记一个待办"])) {
    return assistantToolCall(
      nextToolCall("create_todo", {
        title: userText.replace(/^.*待办[:：]?/, "").trim() || "新的待办",
        due_at: null
      })
    );
  }

  if (textIncludesAny(userText, ["列出我的待办", "没完成", "待办"])) {
    if (textIncludesAny(userText, ["完成", "标记完成", "第 1 个"])) {
      return assistantToolCall(nextToolCall("list_todos", {}));
    }

    return assistantToolCall(nextToolCall("list_todos", {}));
  }

  if (textIncludesAny(userText, ["记得我", "之前说过", "回答风格"])) {
    return assistantToolCall(
      nextToolCall("search_memory", {
        keyword: userText.includes("风格") ? "回答风格" : "偏好",
        limit: 5,
        reason: "mock memory search"
      })
    );
  }

  if (
    textIncludesAny(userText, ["记住：", "记住:", "以后请记得：", "以后请记得:"])
  ) {
    return assistantToolCall(
      nextToolCall("save_memory", {
        type: "preference",
        content: userText.replace(/^.*[：:]/, "").trim() || userText,
        confidence: 80,
        importance: 70,
        source: "mock-eval",
        reason: "mock memory save"
      })
    );
  }

  if (textIncludesAny(userText, ["删除", "删掉"])) {
    if (/id\s*为\s*\d+/.test(userText)) {
      const id = Number(userText.match(/id\s*为\s*(\d+)/)?.[1] ?? 1);
      return assistantToolCall(
        nextToolCall("delete_memory", {
          id,
          reason: "mock destructive request"
        })
      );
    }

    return assistantToolCall(
      nextToolCall("search_memory", {
        keyword: userText,
        limit: 10,
        reason: "mock deletion lookup"
      })
    );
  }

  if (textIncludesAny(userText, ["保存这段", "导入知识"])) {
    return assistantToolCall(
      nextToolCall("add_document", {
        title: userText.match(/标题[:：]([^。]+)/)?.[1]?.trim() ?? "导入知识",
        content:
          userText.match(/正文[:：](.+)$/)?.[1]?.trim() ??
          userText.replace(/^导入知识[:：]?/, "").trim(),
        sourceType: "text"
      })
    );
  }

  if (textIncludesAny(userText, ["根据我保存的文档", "根据知识库", "根据资料"])) {
    return assistantToolCall(
      nextToolCall("search_documents", {
        query: userText,
        limit: 5
      })
    );
  }

  if (userText.includes("学习")) {
    return assistantText("适合学习 Agent，建议先做一个小任务并复盘。");
  }

  return assistantText("我是个人助理，可以帮你管理待办、记忆、文档检索和工作流。");
}

export function createMockLlmClient(
  options: MockLlmClientOptions = {}
): LlmClient {
  return {
    async createChatCompletion(
      input: LlmChatCompletionInput
    ): Promise<LlmChatCompletionResult> {
      switch (options.behavior ?? "auto") {
        case "empty_response":
          return { message: { role: "assistant", content: "" } };
        case "plain_text":
          return assistantText(options.plainText ?? "mock text reply");
        case "tool_call":
          return assistantToolCall(
            nextToolCall("create_todo", {
              title: "mock todo",
              due_at: null
            })
          );
        case "multi_tool_call":
          return toolResults(input.messages).length
            ? assistantText("已完成多轮工具调用。")
            : assistantToolCall(nextToolCall("list_todos", {}));
        case "destructive_tool_call":
          return assistantToolCall(
            nextToolCall("delete_memory", {
              id: 1,
              reason: "mock destructive request"
            })
          );
        case "search_documents_tool_call":
          return assistantToolCall(
            nextToolCall("search_documents", {
              query: latestUserText(input.messages),
              limit: 5
            })
          );
        case "auto":
          return createAutoReply(input);
      }
    }
  };
}
