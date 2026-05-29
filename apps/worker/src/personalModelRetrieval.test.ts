import { describe, expect, it } from "vitest";
import { retrieveHybridChunks } from "./personalModelRetrieval.js";
import { createFakeRepositories } from "./test-helpers/fakeRepositories.js";
import {
  type PersonalModelSourceDocumentRecord,
  type PersonalModelSourceChunkRecord
} from "./repositories.js";
import { type WorkerEnv } from "./types.js";

describe("Personal Model Retrieval and Update", () => {
  it("should correctly update PersonalModelSourceChunk", async () => {
    const repositories = createFakeRepositories();
    const ownerTgUserId = 123;
    const documentId = "doc1";
    const chunkId = "chunk1";

    await repositories.createPersonalModelSourceChunk({
      id: chunkId,
      ownerTgUserId,
      documentId,
      chunkIndex: 0,
      content: "test",
      normalizedContent: "test",
      tokenCount: 1,
      metadataJson: "{}",
      createdAt: Date.now(),
      vectorId: null,
      indexedAt: null,
      indexStatus: "pending"
    });

    const updated = await repositories.updatePersonalModelSourceChunk({
      ownerTgUserId,
      id: chunkId,
      patch: {
        vectorId: "vec1",
        indexedAt: 1234567890,
        indexStatus: "indexed"
      }
    });

    expect(updated).not.toBeNull();
    expect(updated?.vectorId).toBe("vec1");
    expect(updated?.indexedAt).toBe(1234567890);
    expect(updated?.indexStatus).toBe("indexed");

    const fetched = await repositories.getPersonalModelSourceChunk({ ownerTgUserId, id: chunkId });
    expect(fetched?.indexStatus).toBe("indexed");
  });
});

describe("Hybrid Retrieval (personalModelRetrieval)", () => {
  const ownerTgUserId = 12345;
  const now = Date.now();

  const baseDoc: Omit<
    PersonalModelSourceDocumentRecord,
    "id" | "sourceType" | "title" | "content" | "normalizedContent"
  > = {
    ownerTgUserId,
    uri: null,
    status: "active",
    usagePolicy: "default_available",
    sensitivity: "low",
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
    ingestedAt: now,
    metadataJson: "{}"
  };

  const baseChunk: Omit<PersonalModelSourceChunkRecord, "id" | "documentId" | "normalizedContent"> = {
    ownerTgUserId,
    chunkIndex: 0,
    content: "test",
    tokenCount: null,
    metadataJson: "{}",
    createdAt: now,
    vectorId: null,
    indexedAt: null,
    indexStatus: "pending"
  };

  async function seedChunks(repositories: ReturnType<typeof createFakeRepositories>) {
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-a",
      sourceType: "writing",
      title: "Writing Doc A",
      content: "技术写作是一门艺术",
      normalizedContent: "技术写作是一门艺术"
    });
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-b",
      sourceType: "blog",
      title: "Blog Post B",
      content: "前端开发现状分析",
      normalizedContent: "前端开发现状分析"
    });
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-c",
      sourceType: "personality_framework",
      title: "MBTI Framework",
      content: "MBTI: INTJ 分析",
      normalizedContent: "mbti: intj 分析"
    });
    // Excluded document (do_not_use)
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-excluded",
      sourceType: "writing",
      title: "Excluded Doc",
      content: "被禁用的前端文档",
      usagePolicy: "do_not_use"
    });

    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-a1",
      documentId: "doc-a",
      content: "技术写作是一门艺术",
      normalizedContent: "技术写作是一门艺术"
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-b1",
      documentId: "doc-b",
      content: "前端开发现状分析，混合应用的未来",
      normalizedContent: "前端开发现状分析，混合应用的未来"
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-c1",
      documentId: "doc-c",
      content: "MBTI INTJ 分析，内向直觉思维判断",
      normalizedContent: "mbti intj 分析，内向直觉思维判断"
    });
    // Chunk tied to excluded document
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-excluded",
      documentId: "doc-excluded",
      content: "被禁用的前端文档内容",
      normalizedContent: "被禁用的前端文档内容"
    });
  }

  // ---------- 1. Keyword-only fallback (no env bindings) ----------

  it("falls back to keyword-only retrieval when env is undefined", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "技术写作",
      limit: 3
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.some(c => c.id === "chunk-a1")).toBe(true);
    expect(result.trace.vectorHits).toBe(0);
    expect(result.trace.keywordHits).toBeGreaterThan(0);
  });

  it("falls back to keyword-only retrieval when env has no AI/VECTORIZE", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const envWithoutBindings = {} as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "前端开发",
      limit: 3,
      env: envWithoutBindings
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.some(c => c.id === "chunk-b1")).toBe(true);
    expect(result.trace.vectorHits).toBe(0);
  });

  // ---------- 2. RRF scoring correctness ----------

  it("calculates correct RRF scores for keyword-only results", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "技术写作",
      limit: 5
    });

    // With only keyword results, each chunk should have:
    // rrfScore = 1 / (60 + rank), vectorRank = undefined
    for (const score of result.trace.scores) {
      expect(score.keywordRank).toBeDefined();
      expect(score.vectorRank).toBeUndefined();
      expect(score.rrfScore).toBeCloseTo(1 / (60 + score.keywordRank!), 10);
      expect(score.vectorScore).toBeUndefined();
    }
  });

  // ---------- 3. do_not_use chunks are excluded ----------

  it("excludes chunks from do_not_use documents in keyword search", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "前端",
      limit: 10
    });

    // chunk-excluded is from doc-excluded with usagePolicy = "do_not_use"
    expect(result.chunks.every(c => c.id !== "chunk-excluded")).toBe(true);
    expect(result.trace.scores.every(s => s.chunkId !== "chunk-excluded")).toBe(true);
  });

  // ---------- 4. Empty query returns empty results ----------

  it("returns empty results for query with no keyword matches", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "完全不相关的随机内容xyz",
      limit: 5
    });

    expect(result.chunks.length).toBe(0);
    expect(result.trace.keywordHits).toBe(0);
    expect(result.trace.vectorHits).toBe(0);
    expect(result.trace.mergedHits).toBe(0);
  });

  // ---------- 5. Limit is respected ----------

  it("respects the limit parameter", async () => {
    const repositories = createFakeRepositories();

    // Create a doc with many chunks that all match "通用"
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-many",
      sourceType: "writing",
      title: "Large Doc",
      content: "通用内容",
      normalizedContent: "通用内容"
    });

    for (let i = 0; i < 10; i++) {
      await repositories.createPersonalModelSourceChunk({
        ...baseChunk,
        id: `chunk-many-${i}`,
        documentId: "doc-many",
        chunkIndex: i,
        content: `通用段落 ${i}`,
        normalizedContent: `通用段落 ${i}`
      });
    }

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "通用",
      limit: 3
    });

    expect(result.chunks.length).toBeLessThanOrEqual(3);
    expect(result.trace.scores.length).toBeLessThanOrEqual(3);
  });

  // ---------- 6. Trace structure is well-formed ----------

  it("returns a well-formed trace structure", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "技术",
      limit: 5
    });

    // Verify trace shape
    expect(result.trace).toHaveProperty("keywordHits");
    expect(result.trace).toHaveProperty("vectorHits");
    expect(result.trace).toHaveProperty("mergedHits");
    expect(result.trace).toHaveProperty("scores");
    expect(typeof result.trace.keywordHits).toBe("number");
    expect(typeof result.trace.vectorHits).toBe("number");
    expect(typeof result.trace.mergedHits).toBe("number");
    expect(Array.isArray(result.trace.scores)).toBe(true);

    // Each score item should have chunkId and rrfScore
    for (const s of result.trace.scores) {
      expect(s.chunkId).toBeTruthy();
      expect(typeof s.rrfScore).toBe("number");
      expect(s.rrfScore).toBeGreaterThan(0);
    }
  });

  // ---------- 7. Scores are sorted descending ----------

  it("returns trace scores sorted by RRF score descending", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "分析",
      limit: 5
    });

    const scores = result.trace.scores;
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].rrfScore).toBeGreaterThanOrEqual(scores[i].rrfScore);
    }
  });

  // ---------- 8. Chunk IDs match trace score IDs ----------

  it("returned chunks match trace score chunkIds in order", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "分析",
      limit: 5
    });

    expect(result.chunks.length).toBe(result.trace.scores.length);
    for (let i = 0; i < result.chunks.length; i++) {
      expect(result.chunks[i].id).toBe(result.trace.scores[i].chunkId);
    }
  });

  // ---------- 9. Mock Vectorize + AI for hybrid RRF ----------

  it("merges keyword and vector results via RRF when env bindings are provided", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    // Create a mock env with AI and VECTORIZE bindings
    const mockEnv = {
      AI: {
        run: async (_model: string, _input: any) => ({
          data: [[0.1, 0.2, 0.3]] // fake embedding
        })
      },
      VECTORIZE: {
        query: async (_embedding: number[], _options: any) => ({
          matches: [
            { id: "chunk-c1", score: 0.95 }, // vector finds chunk-c1 (not in keyword result for "前端")
            { id: "chunk-b1", score: 0.80 }  // vector also finds chunk-b1 (also in keyword result)
          ]
        })
      }
    } as unknown as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "前端开发",
      limit: 5,
      env: mockEnv
    });

    // chunk-b1 should be present (matched by both keyword AND vector → higher RRF score)
    expect(result.chunks.some(c => c.id === "chunk-b1")).toBe(true);
    // chunk-c1 should be present (matched by vector)
    expect(result.chunks.some(c => c.id === "chunk-c1")).toBe(true);

    // Verify trace
    expect(result.trace.keywordHits).toBeGreaterThan(0);
    expect(result.trace.vectorHits).toBe(2);
    expect(result.trace.mergedHits).toBeGreaterThanOrEqual(2);

    // chunk-b1 should have BOTH keyword and vector ranks (highest RRF since it appears in both)
    const b1Score = result.trace.scores.find(s => s.chunkId === "chunk-b1");
    expect(b1Score).toBeDefined();
    expect(b1Score!.keywordRank).toBeDefined();
    expect(b1Score!.vectorRank).toBeDefined();
    expect(b1Score!.vectorScore).toBeCloseTo(0.80, 2);

    // chunk-c1 should have only vector rank
    const c1Score = result.trace.scores.find(s => s.chunkId === "chunk-c1");
    expect(c1Score).toBeDefined();
    expect(c1Score!.keywordRank).toBeUndefined();
    expect(c1Score!.vectorRank).toBeDefined();
    expect(c1Score!.vectorScore).toBeCloseTo(0.95, 2);

    // chunk-b1 should have higher RRF than chunk-c1 (appears in both lists)
    expect(b1Score!.rrfScore).toBeGreaterThan(c1Score!.rrfScore);
  });

  // ---------- 10. Vector search failure is gracefully handled ----------

  it("gracefully falls back to keyword-only when Vectorize throws", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const mockEnv = {
      AI: {
        run: async () => ({ data: [[0.1, 0.2, 0.3]] })
      },
      VECTORIZE: {
        query: async () => {
          throw new Error("Vectorize unavailable");
        }
      }
    } as unknown as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "前端",
      limit: 5,
      env: mockEnv
    });

    // Should still return keyword results
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.trace.vectorHits).toBe(0);
    expect(result.trace.keywordHits).toBeGreaterThan(0);
  });

  // ---------- 11. AI embedding failure is gracefully handled ----------

  it("gracefully falls back to keyword-only when AI embedding throws", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const mockEnv = {
      AI: {
        run: async () => {
          throw new Error("AI model unavailable");
        }
      },
      VECTORIZE: {
        query: async () => ({ matches: [] })
      }
    } as unknown as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "技术",
      limit: 5,
      env: mockEnv
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.trace.vectorHits).toBe(0);
  });

  // ---------- 12. AI returns empty embedding ----------

  it("handles AI returning empty embedding gracefully", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const mockEnv = {
      AI: {
        run: async () => ({ data: [] })
      },
      VECTORIZE: {
        query: async () => ({ matches: [] })
      }
    } as unknown as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "写作",
      limit: 5,
      env: mockEnv
    });

    // Should still return keyword results
    expect(result.chunks.some(c => c.id === "chunk-a1")).toBe(true);
    expect(result.trace.vectorHits).toBe(0);
  });

  // ---------- 13. Deduplication in RRF merge ----------

  it("deduplicates chunks that appear in both keyword and vector results", async () => {
    const repositories = createFakeRepositories();
    await seedChunks(repositories);

    const mockEnv = {
      AI: {
        run: async () => ({ data: [[0.1, 0.2, 0.3]] })
      },
      VECTORIZE: {
        query: async () => ({
          matches: [
            { id: "chunk-a1", score: 0.90 } // same chunk as keyword match
          ]
        })
      }
    } as unknown as WorkerEnv;

    const result = await retrieveHybridChunks({
      repositories,
      ownerTgUserId,
      query: "技术写作",
      limit: 5,
      env: mockEnv
    });

    // chunk-a1 should appear exactly once in results
    const a1Count = result.chunks.filter(c => c.id === "chunk-a1").length;
    expect(a1Count).toBe(1);

    // chunk-a1 trace should show both keyword and vector rank
    const a1Score = result.trace.scores.find(s => s.chunkId === "chunk-a1");
    expect(a1Score).toBeDefined();
    expect(a1Score!.keywordRank).toBeDefined();
    expect(a1Score!.vectorRank).toBeDefined();
    expect(a1Score!.vectorScore).toBeCloseTo(0.90, 2);
  });
});
