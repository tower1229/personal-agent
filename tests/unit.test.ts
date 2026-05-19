import { describe, expect, it } from "vitest";
import { buildProgressText, formatProgressEventLine } from "../src/bot/progressUpdater.js";
import {
  calculateDocumentRetrievalScore,
  normalizeDocumentKeywordScore,
  scoreDocumentChunkKeywords,
  tokenizeDocumentQuery
} from "../src/db/documents.js";
import { cosineSimilarity } from "../src/services/embeddings.js";
import { parseApprovalDecision } from "../src/services/messageHandler.js";
import { prettyJson } from "../src/admin/ui/formatters.js";
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

  it("formats JSON safely for admin UI", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("{bad json")).toBe("{bad json");
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson(null)).toBe("");
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
});
