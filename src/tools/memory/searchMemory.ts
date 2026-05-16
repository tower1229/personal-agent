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
    const memories = await searchMemories({
      userId: context.userId,
      keyword: args.keyword,
      limit: args.limit,
      sourceRunId: context.runId ?? null,
      reason: args.reason ?? null
    });

    return {
      memories
    };
  }
};
