import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "./client.js";
import {
  documentChunks,
  documents,
  type Document,
  type DocumentChunk,
  type DocumentSourceType
} from "./schema.js";

const chunkSize = 800;
const chunkOverlap = 80;

export interface DocumentChunkSearchResult {
  documentId: number;
  chunkIndex: number;
  content: string;
  score: number;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function splitIntoChunks(content: string): string[] {
  const normalized = content.trim();

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - chunkOverlap, start + 1);
  }

  return chunks;
}

function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );
}

function scoreChunk(content: string, tokens: string[]): number {
  const lowerContent = content.toLowerCase();

  return tokens.reduce((score, token) => {
    const matches = lowerContent.split(token).length - 1;
    return score + matches;
  }, 0);
}

export async function createDocumentWithChunks(input: {
  userId: string;
  title: string;
  content: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
}): Promise<{
  document: Document;
  chunkCount: number;
  duplicate: boolean;
}> {
  const content = input.content.trim();

  if (!content) {
    throw new Error("Document content is required");
  }

  const contentHash = hashContent(content);
  const existing = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, input.userId),
        eq(documents.contentHash, contentHash)
      )
    )
    .limit(1);

  const existingDocument = existing[0];

  if (existingDocument) {
    const existingChunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, existingDocument.id));

    return {
      document: existingDocument,
      chunkCount: existingChunks.length,
      duplicate: true
    };
  }

  const chunks = splitIntoChunks(content);

  if (!chunks.length) {
    throw new Error("Document content is too short to save");
  }

  const now = new Date();
  const created = await db
    .insert(documents)
    .values({
      userId: input.userId,
      title: input.title,
      sourceType: input.sourceType,
      contentHash,
      createdAt: now
    })
    .returning();

  const document = created[0];

  if (!document) {
    throw new Error("Failed to create document");
  }

  await db.insert(documentChunks).values(
    chunks.map((chunk, index) => ({
      documentId: document.id,
      userId: input.userId,
      chunkIndex: index,
      content: chunk,
      metadataJson: JSON.stringify({
        title: input.title,
        source_type: input.sourceType,
        ...(input.metadata ?? {})
      }),
      createdAt: now
    }))
  );

  return {
    document,
    chunkCount: chunks.length,
    duplicate: false
  };
}

export async function searchDocumentChunks(input: {
  userId: string;
  query: string;
  limit: number;
}): Promise<DocumentChunkSearchResult[]> {
  const tokens = tokenize(input.query);

  if (!tokens.length) {
    return [];
  }

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.userId, input.userId));

  return chunks
    .map((chunk) => ({
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: scoreChunk(chunk.content, tokens)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

export async function listDocuments(userId: string): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}
