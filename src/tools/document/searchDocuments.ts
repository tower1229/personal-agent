import { z } from "zod";
import { searchDocumentChunks } from "../../db/documents.js";
import { type AgentTool } from "../types.js";

const searchDocumentsInputSchema = z.object({
  query: z.string().min(1).describe("Search query."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Maximum chunks to return.")
});

export const searchDocumentsTool: AgentTool<
  typeof searchDocumentsInputSchema
> = {
  name: "search_documents",
  description:
    "Search saved document chunks for the current user using hybrid keyword and embedding retrieval. Use this before answering questions that must be based on saved documents.",
  inputSchema: searchDocumentsInputSchema,
  riskLevel: "read",
  async execute(args, context) {
    const chunks = await searchDocumentChunks({
      userId: context.userId,
      query: args.query,
      limit: args.limit
    });

    return {
      retrievalMode: chunks[0]?.retrievalMode ?? "keyword_fallback",
      chunks
    };
  }
};
