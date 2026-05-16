import { z } from "zod";
import { documentSourceTypes } from "../../db/schema.js";
import { ingestDocument } from "../../services/documentIngestion.js";
import { type AgentTool } from "../types.js";

const addDocumentInputSchema = z.object({
  title: z.string().min(1).describe("Document title."),
  content: z.string().min(1).describe("Full document content to save."),
  sourceType: z
    .enum(documentSourceTypes)
    .default("text")
    .describe("Document source type.")
});

export const addDocumentTool: AgentTool<typeof addDocumentInputSchema> = {
  name: "add_document",
  description:
    "Save a user-provided document or knowledge text, split it into chunks, and store it for later retrieval.",
  inputSchema: addDocumentInputSchema,
  riskLevel: "write_low",
  async execute(args, context) {
    const result = await ingestDocument({
      userId: context.userId,
      title: args.title,
      content: args.content,
      sourceType: args.sourceType
    });

    return {
      document_id: result.documentId,
      title: result.title,
      chunk_count: result.chunkCount,
      duplicate: result.skippedDuplicate
    };
  }
};
