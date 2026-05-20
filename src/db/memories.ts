import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { env } from "../config/env.js";
import { cosineSimilarity, generateEmbedding } from "../services/embeddings.js";
import {
  buildCanonicalKey,
  normalizeMemoryContent
} from "../services/memoryNormalization.js";
import { db } from "./client.js";
import {
  memories,
  memoryEmbeddings,
  memoryEvents,
  type Memory,
  type MemoryEventType,
  type MemoryType
} from "./schema.js";

const semanticDuplicateThreshold = 0.9;

export interface UpsertMemoryResult {
  status: "created" | "duplicate" | "updated" | "merged";
  memory: Memory;
  duplicateOfMemoryId?: number;
  mergedFromContent?: string;
  embeddingFailed?: boolean;
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

async function recordMemoryEvent(input: {
  memoryId: number | null;
  userId: string;
  eventType: MemoryEventType;
  sourceRunId: number | null;
  reason: string | null;
  createdAt?: Date;
}): Promise<void> {
  await db.insert(memoryEvents).values({
    memoryId: input.memoryId,
    userId: input.userId,
    eventType: input.eventType,
    sourceRunId: input.sourceRunId,
    reason: input.reason,
    createdAt: input.createdAt ?? new Date()
  });
}

function mergeMemoryContent(existing: string, incoming: string): string {
  if (existing.includes(incoming)) {
    return existing;
  }

  if (incoming.includes(existing)) {
    return incoming;
  }

  return `${existing}；${incoming}`;
}

function isAnswerStylePreference(normalizedContent: string): boolean {
  return (
    normalizedContent.includes("回答") &&
    /简洁|详细|冗长|三段|摘要|风格/.test(normalizedContent)
  );
}

async function findConflictingPreferenceMemories(input: {
  userId: string;
  type: MemoryType;
  normalizedContent: string;
}): Promise<Memory[]> {
  if (
    input.type !== "preference" ||
    !isAnswerStylePreference(input.normalizedContent)
  ) {
    return [];
  }

  const activePreferences = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.userId, input.userId),
        eq(memories.type, "preference"),
        eq(memories.status, "active")
      )
    );

  return activePreferences.filter((memory) => {
    const normalized = memory.normalizedContent ?? normalizeMemoryContent(memory.content);

    return (
      normalized !== input.normalizedContent &&
      isAnswerStylePreference(normalized)
    );
  });
}

export async function createMemoryEmbedding(input: {
  memory: Memory;
  embedding: number[];
  createdAt?: Date;
}): Promise<void> {
  await db.insert(memoryEmbeddings).values({
    memoryId: input.memory.id,
    userId: input.memory.userId,
    provider: env.EMBEDDING_PROVIDER,
    model: env.EMBEDDING_MODEL,
    embeddingJson: JSON.stringify(input.embedding),
    dimensions: input.embedding.length,
    createdAt: input.createdAt ?? new Date()
  });
}

export async function findExactDuplicateMemory(input: {
  userId: string;
  type: MemoryType;
  normalizedContent: string;
  canonicalKey: string | null;
}): Promise<Memory | null> {
  const conditions = [
    eq(memories.userId, input.userId),
    eq(memories.type, input.type),
    eq(memories.status, "active" as const)
  ];

  const duplicateConditions = input.canonicalKey
    ? [
        eq(memories.canonicalKey, input.canonicalKey),
        eq(memories.normalizedContent, input.normalizedContent)
      ]
    : [eq(memories.normalizedContent, input.normalizedContent)];
  const rows = await db
    .select()
    .from(memories)
    .where(and(...conditions, or(...duplicateConditions)))
    .orderBy(desc(memories.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function findSimilarMemories(input: {
  userId: string;
  embedding: number[];
  limit?: number;
}): Promise<Array<{ memory: Memory; similarity: number }>> {
  const rows = await db
    .select({
      memory: memories,
      embedding: memoryEmbeddings
    })
    .from(memoryEmbeddings)
    .innerJoin(memories, eq(memoryEmbeddings.memoryId, memories.id))
    .where(and(eq(memories.userId, input.userId), eq(memories.status, "active")));

  return rows
    .map(({ memory, embedding }) => {
      const parsed = parseEmbedding(embedding.embeddingJson);

      if (!parsed) {
        return null;
      }

      return {
        memory,
        similarity: cosineSimilarity(input.embedding, parsed)
      };
    })
    .filter(
      (item): item is { memory: Memory; similarity: number } => Boolean(item)
    )
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, input.limit ?? 5);
}

export async function markMemoryAccessed(input: {
  userId: string;
  memoryIds: number[];
  sourceRunId: number | null;
  reason: string | null;
}): Promise<void> {
  if (!input.memoryIds.length) {
    return;
  }

  const now = new Date();
  const uniqueIds = Array.from(new Set(input.memoryIds));

  for (const id of uniqueIds) {
    const existing = await db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, input.userId), eq(memories.id, id)))
      .limit(1);
    const memory = existing[0];

    if (!memory) {
      continue;
    }

    await db
      .update(memories)
      .set({
        lastAccessedAt: now,
        accessCount: memory.accessCount + 1,
        updatedAt: now
      })
      .where(and(eq(memories.userId, input.userId), eq(memories.id, id)));

    await recordMemoryEvent({
      memoryId: id,
      userId: input.userId,
      eventType: "accessed",
      sourceRunId: input.sourceRunId,
      reason: input.reason,
      createdAt: now
    });
  }
}

export async function archiveMemory(input: {
  userId: string;
  id: number;
  status?: "archived" | "deleted";
  supersededByMemoryId?: number | null;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory> {
  const existing = await db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, input.userId), eq(memories.id, input.id)))
    .limit(1);
  const memory = existing[0];

  if (!memory) {
    throw new Error(`Memory ${input.id} was not found`);
  }

  const now = new Date();
  const status = input.status ?? "archived";

  const updated = await db
    .update(memories)
    .set({
      status,
      supersededByMemoryId: input.supersededByMemoryId ?? null,
      updatedAt: now
    })
    .where(and(eq(memories.userId, input.userId), eq(memories.id, input.id)))
    .returning();
  const archived = updated[0] ?? memory;

  await recordMemoryEvent({
    memoryId: memory.id,
    userId: input.userId,
    eventType: status === "deleted" ? "deleted" : "archived",
    sourceRunId: input.sourceRunId,
    reason: input.reason,
    createdAt: now
  });

  return archived;
}

export async function upsertMemory(input: {
  userId: string;
  type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  source: string | null;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<UpsertMemoryResult> {
  const now = new Date();
  const normalizedContent = normalizeMemoryContent(input.content);
  const canonicalKey = buildCanonicalKey({
    userId: input.userId,
    type: input.type,
    normalizedContent
  });
  const exactDuplicate = await findExactDuplicateMemory({
    userId: input.userId,
    type: input.type,
    normalizedContent,
    canonicalKey
  });

  if (exactDuplicate) {
    const updated = await db
      .update(memories)
      .set({
        confidence: Math.max(exactDuplicate.confidence, input.confidence),
        importance: Math.max(exactDuplicate.importance, input.importance),
        source: input.source ?? exactDuplicate.source,
        updatedAt: now,
        lastAccessedAt: now,
        accessCount: exactDuplicate.accessCount + 1
      })
      .where(eq(memories.id, exactDuplicate.id))
      .returning();
    const memory = updated[0] ?? exactDuplicate;

    await recordMemoryEvent({
      memoryId: memory.id,
      userId: input.userId,
      eventType: "duplicate_detected",
      sourceRunId: input.sourceRunId,
      reason: input.reason ?? "exact duplicate memory",
      createdAt: now
    });

    return {
      status: "duplicate",
      memory,
      duplicateOfMemoryId: memory.id
    };
  }

  let embedding: number[] | null = null;
  let embeddingFailed = false;

  try {
    embedding = await generateEmbedding(input.content);
  } catch {
    embeddingFailed = true;
  }

  if (embedding) {
    const [similar] = await findSimilarMemories({
      userId: input.userId,
      embedding,
      limit: 1
    });

    if (similar && similar.similarity >= semanticDuplicateThreshold) {
      const mergedContent = mergeMemoryContent(similar.memory.content, input.content);
      const mergedNormalizedContent = normalizeMemoryContent(mergedContent);
      const updated = await db
        .update(memories)
        .set({
          content: mergedContent,
          normalizedContent: mergedNormalizedContent,
          canonicalKey: buildCanonicalKey({
            userId: input.userId,
            type: similar.memory.type,
            normalizedContent: mergedNormalizedContent
          }),
          confidence: Math.max(similar.memory.confidence, input.confidence),
          importance: Math.max(similar.memory.importance, input.importance),
          source: input.source ?? similar.memory.source,
          updatedAt: now,
          lastAccessedAt: now,
          accessCount: similar.memory.accessCount + 1
        })
        .where(eq(memories.id, similar.memory.id))
        .returning();
      const memory = updated[0] ?? similar.memory;

      await recordMemoryEvent({
        memoryId: memory.id,
        userId: input.userId,
        eventType: mergedContent === similar.memory.content ? "updated" : "merged",
        sourceRunId: input.sourceRunId,
        reason:
          input.reason ??
          `semantic duplicate similarity=${Math.round(similar.similarity * 10_000) / 10_000}`,
        createdAt: now
      });

      await createMemoryEmbedding({
        memory,
        embedding,
        createdAt: now
      });

      return {
        status: mergedContent === similar.memory.content ? "updated" : "merged",
        memory,
        duplicateOfMemoryId: similar.memory.id,
        mergedFromContent: input.content
      };
    }
  }

  const created = await db
    .insert(memories)
    .values({
      userId: input.userId,
      type: input.type,
      content: input.content,
      normalizedContent,
      canonicalKey,
      status: "active",
      confidence: input.confidence,
      importance: input.importance,
      source: input.source,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: null,
      accessCount: 0,
      supersededByMemoryId: null
    })
    .returning();
  const memory = created[0];

  if (!memory) {
    throw new Error("Failed to save memory");
  }

  await recordMemoryEvent({
    memoryId: memory.id,
    userId: input.userId,
    eventType: "created",
    sourceRunId: input.sourceRunId,
    reason: input.reason,
    createdAt: now
  });

  const conflicts = await findConflictingPreferenceMemories({
    userId: input.userId,
    type: input.type,
    normalizedContent
  });

  for (const conflict of conflicts) {
    await recordMemoryEvent({
      memoryId: conflict.id,
      userId: input.userId,
      eventType: "conflict_detected",
      sourceRunId: input.sourceRunId,
      reason: `superseded by memory ${memory.id}`,
      createdAt: now
    });
    await archiveMemory({
      userId: input.userId,
      id: conflict.id,
      status: "archived",
      supersededByMemoryId: memory.id,
      sourceRunId: input.sourceRunId,
      reason: `superseded by memory ${memory.id}`
    });
    await recordMemoryEvent({
      memoryId: conflict.id,
      userId: input.userId,
      eventType: "superseded",
      sourceRunId: input.sourceRunId,
      reason: `superseded by memory ${memory.id}`,
      createdAt: now
    });
  }

  if (embedding) {
    await createMemoryEmbedding({
      memory,
      embedding,
      createdAt: now
    });
  } else if (embeddingFailed) {
    await recordMemoryEvent({
      memoryId: memory.id,
      userId: input.userId,
      eventType: "updated",
      sourceRunId: input.sourceRunId,
      reason: "embedding_failed",
      createdAt: now
    });
  }

  return {
    status: "created",
    memory,
    embeddingFailed
  };
}

export async function saveMemory(
  input: Parameters<typeof upsertMemory>[0]
): Promise<Memory> {
  return (await upsertMemory(input)).memory;
}

export async function searchMemories(input: {
  userId: string;
  keyword: string;
  limit: number;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory[]> {
  const keyword = input.keyword.trim();
  const activeCondition = and(
    eq(memories.userId, input.userId),
    eq(memories.status, "active" as const)
  );
  const baseQuery = () =>
    db
      .select()
      .from(memories)
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(input.limit);
  let results: Memory[] = [];

  if (!keyword) {
    results = await baseQuery().where(activeCondition);
  } else {
    results = await baseQuery().where(
      and(activeCondition, like(memories.content, `%${keyword}%`))
    );
  }

  const terms = keyword
    .split(/[\s,，。；;、]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  if (keyword && results.length === 0 && terms.length > 1) {
    results = await baseQuery().where(
      and(
        activeCondition,
        or(...terms.map((term) => like(memories.content, `%${term}%`)))
      )
    );
  }

  if (keyword && results.length === 0 && !/[A-Za-z0-9]/.test(keyword)) {
    results = await db
      .select()
      .from(memories)
      .where(activeCondition)
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(Math.min(input.limit, 5));
  }

  await recordMemoryEvent({
    memoryId: null,
    userId: input.userId,
    eventType: "searched",
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories")
  });

  await markMemoryAccessed({
    userId: input.userId,
    memoryIds: results.map((memory) => memory.id),
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories")
  });

  return results;
}

export async function searchMemoriesStrict(input: {
  userId: string;
  keyword: string;
  limit: number;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory[]> {
  const keyword = input.keyword.trim();
  const activeCondition = and(
    eq(memories.userId, input.userId),
    eq(memories.status, "active" as const)
  );
  const where = keyword
    ? and(activeCondition, like(memories.content, `%${keyword}%`))
    : activeCondition;

  const results = await db
    .select()
    .from(memories)
    .where(where)
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(input.limit);

  await recordMemoryEvent({
    memoryId: null,
    userId: input.userId,
    eventType: "searched",
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories")
  });

  await markMemoryAccessed({
    userId: input.userId,
    memoryIds: results.map((memory) => memory.id),
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories")
  });

  return results;
}

export async function deleteMemory(input: {
  userId: string;
  id: number;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory> {
  return archiveMemory({
    userId: input.userId,
    id: input.id,
    status: "deleted",
    sourceRunId: input.sourceRunId,
    reason: input.reason
  });
}

export async function getMemoriesByIds(input: {
  userId: string;
  ids: number[];
}): Promise<Memory[]> {
  if (!input.ids.length) {
    return [];
  }

  return db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, input.userId), inArray(memories.id, input.ids))
    );
}

export async function listActiveMemories(input: {
  userId: string;
  limit: number;
}): Promise<Memory[]> {
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, input.userId), eq(memories.status, "active")))
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(input.limit);
}

export async function listImportantMemories(input: {
  userId: string;
  limit: number;
}): Promise<Memory[]> {
  return listActiveMemories(input);
}
