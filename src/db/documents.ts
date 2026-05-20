import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import {
  cosineSimilarity,
  generateEmbedding
} from "../services/embeddings.js";
import { rerankDocumentChunks } from "../services/rerank.js";
import { splitDocumentIntoChunks } from "../services/chunking.js";
import { tokenizeRagQuery } from "../services/ragText.js";
import { db } from "./client.js";
import {
  documentChunkEmbeddings,
  documentChunks,
  documents,
  type Document,
  type DocumentChunk,
  type DocumentSourceType
} from "./schema.js";

export interface DocumentChunkSearchResult {
  documentId: number;
  chunkIndex: number;
  content: string;
  sourceTitle: string;
  sourceType: DocumentSourceType;
  headingPath: string[];
  score: number;
  rerankScore: number;
  keywordScore: number;
  vectorScore: number;
  retrievalMode: "hybrid" | "keyword_fallback";
  rerankReasons: string[];
}

type DocumentChunkRetrievalCandidate = Omit<
  DocumentChunkSearchResult,
  "rerankScore" | "rerankReasons"
> & {
  createdAt: Date;
};

export interface DocumentChunkWithEmbeddingStatus extends DocumentChunk {
  hasEmbedding: boolean;
  embeddingModel: string | null;
  embeddingProvider: string | null;
  embeddingDimensions: number | null;
  dimensions: number | null;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function tokenizeDocumentQuery(query: string): string[] {
  return tokenizeRagQuery(query);
}

export function scoreDocumentChunkKeywords(
  content: string,
  tokens: string[]
): number {
  const lowerContent = content.toLowerCase();

  return tokens.reduce((score, token) => {
    const matches = lowerContent.split(token).length - 1;
    return score + matches;
  }, 0);
}

export function normalizeDocumentKeywordScore(
  rawScore: number,
  tokenCount: number
): number {
  if (tokenCount <= 0) {
    return 0;
  }

  return Math.min(rawScore / tokenCount, 1);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, 1));
}

function roundScore(score: number): number {
  return Math.round(score * 10_000) / 10_000;
}

export function calculateDocumentRetrievalScore(input: {
  keywordScore: number;
  vectorScore: number;
  retrievalMode: "hybrid" | "keyword_fallback";
}): number {
  const score =
    input.retrievalMode === "hybrid"
      ? input.keywordScore * 0.4 + input.vectorScore * 0.6
      : input.keywordScore;

  return roundScore(clampScore(score));
}

function parseEmbedding(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "number" && Number.isFinite(item))
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function stringArrayMetadata(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function hasRerankedEvidence(
  chunk: DocumentChunkSearchResult & { createdAt?: Date }
): boolean {
  if (chunk.keywordScore > 0) {
    return true;
  }

  if (chunk.vectorScore >= 0.9) {
    return true;
  }

  return chunk.rerankReasons.some(
    (reason) =>
      reason === "exactPhraseMatch" ||
      reason.startsWith("titleMatch=") ||
      reason.startsWith("headingPathMatch=")
  );
}

async function saveChunkEmbeddings(input: {
  userId: string;
  chunks: DocumentChunk[];
}): Promise<void> {
  for (const chunk of input.chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);

      await db.insert(documentChunkEmbeddings).values({
        documentChunkId: chunk.id,
        userId: input.userId,
        provider: env.EMBEDDING_PROVIDER,
        model: env.EMBEDDING_MODEL,
        embeddingJson: JSON.stringify(embedding),
        dimensions: embedding.length,
        createdAt: new Date()
      });
    } catch (error) {
      const metadata = parseMetadata(chunk.metadataJson);

      await db
        .update(documentChunks)
        .set({
          metadataJson: JSON.stringify({
            ...metadata,
            embedding_failed: true,
            embedding_provider: env.EMBEDDING_PROVIDER,
            embedding_model: env.EMBEDDING_MODEL
          })
        })
        .where(eq(documentChunks.id, chunk.id));
    }
  }
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

  const chunks = splitDocumentIntoChunks({
    title: input.title,
    sourceType: input.sourceType,
    content,
    metadata: input.metadata
  });

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

  const createdChunks = await db
    .insert(documentChunks)
    .values(chunks.map((chunk, index) => ({
      documentId: document.id,
      userId: input.userId,
      chunkIndex: index,
      content: chunk.content,
      metadataJson: JSON.stringify({
        title: input.title,
        source_type: input.sourceType,
        ...chunk.metadata
      }),
      createdAt: now
    })))
    .returning();

  await saveChunkEmbeddings({
    userId: input.userId,
    chunks: createdChunks
  });

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
  const tokens = tokenizeDocumentQuery(input.query);
  const limit = Math.min(Math.max(input.limit, 1), 10);

  if (!tokens.length) {
    return [];
  }

  const rows = await db
    .select({
      chunk: documentChunks,
      document: documents
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.userId, input.userId));

  let queryEmbedding: number[] | null = null;

  try {
    queryEmbedding = await generateEmbedding(input.query);
  } catch {
    queryEmbedding = null;
  }

  const embeddings = queryEmbedding
    ? await db
        .select()
        .from(documentChunkEmbeddings)
        .where(eq(documentChunkEmbeddings.userId, input.userId))
    : [];
  const embeddingByChunkId = new Map(
    embeddings
      .filter(
        (embedding) =>
          embedding.provider === env.EMBEDDING_PROVIDER &&
          embedding.model === env.EMBEDDING_MODEL
      )
      .map((embedding) => [
        embedding.documentChunkId,
        parseEmbedding(embedding.embeddingJson)
      ])
      .filter((entry): entry is [number, number[]] => Boolean(entry[1]))
  );
  const hasUsableEmbeddings = Boolean(queryEmbedding && embeddingByChunkId.size);
  const retrievalMode = hasUsableEmbeddings ? "hybrid" : "keyword_fallback";

  const candidates = rows
    .map(({ chunk, document }) => {
      const metadata = parseMetadata(chunk.metadataJson);
      const headingPath = stringArrayMetadata(metadata.headingPath);
      const rawKeywordScore = scoreDocumentChunkKeywords(chunk.content, tokens);
      const keywordScore = normalizeDocumentKeywordScore(
        rawKeywordScore,
        tokens.length
      );
      const chunkEmbedding = embeddingByChunkId.get(chunk.id);
      const vectorScore =
        queryEmbedding && chunkEmbedding
          ? clampScore(cosineSimilarity(queryEmbedding, chunkEmbedding))
          : 0;
      const score = calculateDocumentRetrievalScore({
        keywordScore,
        vectorScore,
        retrievalMode
      });

      return {
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        sourceTitle: document.title,
        sourceType: document.sourceType,
        headingPath,
        score,
        keywordScore: roundScore(keywordScore),
        vectorScore: roundScore(vectorScore),
        retrievalMode,
        createdAt: document.createdAt
      } satisfies DocumentChunkRetrievalCandidate;
    })
    .filter((chunk) =>
      retrievalMode === "hybrid"
        ? chunk.score > 0
        : chunk.keywordScore > 0
    )
    .sort((a, b) => {
      const leftRecallScore = a.score + a.keywordScore;
      const rightRecallScore = b.score + b.keywordScore;
      const recallDelta = rightRecallScore - leftRecallScore;

      if (recallDelta !== 0) {
        return recallDelta;
      }

      return b.score - a.score;
    })
    .slice(0, 20);

  return rerankDocumentChunks({
    query: input.query,
    candidates
  })
    .filter(hasRerankedEvidence)
    .slice(0, limit)
    .map(({ createdAt, ...chunk }) => chunk);
}

export async function listDocuments(userId: string): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function getDocumentForUser(input: {
  userId?: string;
  id: number;
}): Promise<Document | null> {
  const conditions = [eq(documents.id, input.id)];

  if (input.userId) {
    conditions.push(eq(documents.userId, input.userId));
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function listDocumentChunks(input: {
  documentId: number;
  userId?: string;
}): Promise<DocumentChunkWithEmbeddingStatus[]> {
  const conditions = [eq(documentChunks.documentId, input.documentId)];

  if (input.userId) {
    conditions.push(eq(documentChunks.userId, input.userId));
  }

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(and(...conditions))
    .orderBy(documentChunks.chunkIndex);
  const embeddings = await db
    .select()
    .from(documentChunkEmbeddings)
    .where(
      input.userId
        ? eq(documentChunkEmbeddings.userId, input.userId)
        : eq(documentChunkEmbeddings.model, env.EMBEDDING_MODEL)
    );
  const chunkIds = new Set(chunks.map((chunk) => chunk.id));
  const embeddingByChunkId = new Map(
    embeddings
      .filter((embedding) => chunkIds.has(embedding.documentChunkId))
      .map((embedding) => [embedding.documentChunkId, embedding])
  );

  return chunks.map((chunk) => {
    const embedding = embeddingByChunkId.get(chunk.id);

    return {
      ...chunk,
      hasEmbedding: Boolean(embedding),
      embeddingModel: embedding?.model ?? null,
      embeddingProvider: embedding?.provider ?? null,
      embeddingDimensions: embedding?.dimensions ?? null,
      dimensions: embedding?.dimensions ?? null
    };
  });
}
