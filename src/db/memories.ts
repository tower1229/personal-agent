import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "./client.js";
import {
  memories,
  memoryEvents,
  type Memory,
  type MemoryType
} from "./schema.js";

export async function saveMemory(input: {
  userId: string;
  type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  source: string | null;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory> {
  const now = new Date();
  const created = await db
    .insert(memories)
    .values({
      userId: input.userId,
      type: input.type,
      content: input.content,
      confidence: input.confidence,
      importance: input.importance,
      source: input.source,
      createdAt: now,
      updatedAt: now
    })
    .returning();

  const memory = created[0];

  if (!memory) {
    throw new Error("Failed to save memory");
  }

  await db.insert(memoryEvents).values({
    memoryId: memory.id,
    userId: input.userId,
    eventType: "created",
    sourceRunId: input.sourceRunId,
    reason: input.reason,
    createdAt: now
  });

  return memory;
}

export async function searchMemories(input: {
  userId: string;
  keyword: string;
  limit: number;
  sourceRunId: number | null;
  reason: string | null;
}): Promise<Memory[]> {
  const keyword = input.keyword.trim();
  const baseQuery = () =>
    db
      .select()
      .from(memories)
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(input.limit);
  let results: Memory[] = [];

  if (!keyword) {
    results = await baseQuery().where(eq(memories.userId, input.userId));
  } else {
    results = await baseQuery().where(
      and(eq(memories.userId, input.userId), like(memories.content, `%${keyword}%`))
    );
  }

  const terms = keyword
    .split(/[\s,，。；;、]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  if (keyword && results.length === 0 && terms.length > 1) {
    results = await baseQuery().where(
      and(
        eq(memories.userId, input.userId),
        or(...terms.map((term) => like(memories.content, `%${term}%`)))
      )
    );
  }

  if (keyword && results.length === 0) {
    results = await db
      .select()
      .from(memories)
      .where(eq(memories.userId, input.userId))
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(Math.min(input.limit, 5));
  }

  await db.insert(memoryEvents).values({
    memoryId: null,
    userId: input.userId,
    eventType: "searched",
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories"),
    createdAt: new Date()
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
  const where = keyword
    ? and(eq(memories.userId, input.userId), like(memories.content, `%${keyword}%`))
    : eq(memories.userId, input.userId);

  const results = await db
    .select()
    .from(memories)
    .where(where)
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(input.limit);

  await db.insert(memoryEvents).values({
    memoryId: null,
    userId: input.userId,
    eventType: "searched",
    sourceRunId: input.sourceRunId,
    reason: input.reason ?? (keyword ? `keyword: ${keyword}` : "list memories"),
    createdAt: new Date()
  });

  return results;
}

export async function deleteMemory(input: {
  userId: string;
  id: number;
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

  await db
    .delete(memories)
    .where(and(eq(memories.userId, input.userId), eq(memories.id, input.id)));

  await db.insert(memoryEvents).values({
    memoryId: memory.id,
    userId: input.userId,
    eventType: "deleted",
    sourceRunId: input.sourceRunId,
    reason: input.reason,
    createdAt: new Date()
  });

  return memory;
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

export async function listImportantMemories(input: {
  userId: string;
  limit: number;
}): Promise<Memory[]> {
  return db
    .select()
    .from(memories)
    .where(eq(memories.userId, input.userId))
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(input.limit);
}
