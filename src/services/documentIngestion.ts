import { createDocumentWithChunks } from "../db/documents.js";
import { type DocumentSourceType } from "../db/schema.js";

export interface IngestDocumentInput {
  userId: string;
  title: string;
  content: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
}

export interface IngestDocumentResult {
  documentId: number;
  title: string;
  chunkCount: number;
  skippedDuplicate: boolean;
}

export async function ingestDocument(
  input: IngestDocumentInput
): Promise<IngestDocumentResult> {
  const result = await createDocumentWithChunks({
    userId: input.userId,
    title: input.title,
    content: input.content,
    sourceType: input.sourceType,
    metadata: input.metadata
  });

  return {
    documentId: result.document.id,
    title: result.document.title,
    chunkCount: result.chunkCount,
    skippedDuplicate: result.duplicate
  };
}
