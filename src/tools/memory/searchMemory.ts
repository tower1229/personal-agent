import { z } from "zod";
import { searchMemories } from "../../db/memories.js";
import { type AgentTool } from "../types.js";

const searchMemoryInputSchema = z.object({
  keyword: z
    .string()
    .default("")
    .describe("Keyword to search in memories. Use an empty string to list relevant memories."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .describe("Maximum number of memories to return."),
  reason: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Why this search is being performed.")
});

export const searchMemoryTool: AgentTool<typeof searchMemoryInputSchema> = {
  name: "search_memory",
  description:
    "Search long-term memories for the current user by keyword. Use when the user asks what you remember or asks about prior preferences/facts.",
  inputSchema: searchMemoryInputSchema,
  riskLevel: "read",
  async execute(args, context) {
    const keyword = args.keyword.trim();
    const memories = await searchMemories({
      userId: context.userId,
      keyword,
      limit: args.limit,
      sourceRunId: context.runId ?? null,
      reason: args.reason ?? null
    });
    const terms = keyword
      .split(/[\s,，。；;、]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
    const matchedTerms = terms.filter((term) =>
      memories.some((memory) => memory.content.includes(term))
    );
    const exactKeywordMatched = keyword
      ? memories.some((memory) => memory.content.includes(keyword))
      : true;

    return {
      memories,
      query: keyword,
      exactKeywordMatched,
      matchedTerms,
      note:
        keyword && memories.length > 0 && !exactKeywordMatched && !matchedTerms.length
          ? "No exact keyword match was found. These are fallback important memories for context; do not treat them as exact matches for deletion."
          : null
    };
  }
};
