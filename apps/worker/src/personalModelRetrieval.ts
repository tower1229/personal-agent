import { type AgentRepositories, type PersonalModelSourceChunkRecord } from "./repositories.js";
import { type WorkerEnv } from "./types.js";

export interface SearchTraceItem {
  chunkId: string;
  keywordRank?: number;
  vectorRank?: number;
  rrfScore: number;
  vectorScore?: number;
}

export interface HybridRetrievalResult {
  chunks: PersonalModelSourceChunkRecord[];
  trace: {
    keywordHits: number;
    vectorHits: number;
    mergedHits: number;
    scores: SearchTraceItem[];
  };
}

/**
 * Perform hybrid retrieval combining D1 keyword search and Cloudflare Vectorize semantic search,
 * merged via Reciprocal Rank Fusion (RRF).
 */
export async function retrieveHybridChunks(input: {
  repositories: AgentRepositories;
  ownerTgUserId: number;
  query: string;
  limit: number;
  env?: WorkerEnv;
}): Promise<HybridRetrievalResult> {
  const { repositories, ownerTgUserId, query, limit, env } = input;

  // 1. D1 Keyword Retrieval
  let keywordChunks: PersonalModelSourceChunkRecord[] = [];
  try {
    keywordChunks = await repositories.searchPersonalModelSourceChunks({
      ownerTgUserId,
      keyword: query,
      limit
    });
  } catch (error) {
    console.error("D1 Keyword search failed in hybrid retrieval:", error);
  }

  // 2. Cloudflare Vectorize Retrieval (if bindings are available)
  let vectorChunks: PersonalModelSourceChunkRecord[] = [];
  const vectorScoresMap = new Map<string, number>();

  if (env?.AI && env?.VECTORIZE) {
    try {
      // Get embedding from Workers AI
      const aiResponse = await env.AI.run("@cf/baai/bge-large-zh-v1.5", {
        text: [query]
      }) as any;

      const embedding = aiResponse?.data?.[0];
      if (Array.isArray(embedding) && embedding.length > 0) {
        // Query Vectorize Index
        const vectorizeResult = await env.VECTORIZE.query(embedding, {
          topK: limit
        });

        const matches = vectorizeResult?.matches || [];
        const matchIds = matches.map(m => m.id);
        
        for (const match of matches) {
          vectorScoresMap.set(match.id, match.score);
        }

        if (matchIds.length > 0) {
          // Retrieve actual chunk records from D1
          const dbChunks = await repositories.getPersonalModelSourceChunksByIds({
            ownerTgUserId,
            ids: matchIds
          });
          
          // Order them to match Vectorize query results order
          const chunkMap = new Map(dbChunks.map(c => [c.id, c]));
          vectorChunks = matchIds
            .map(id => chunkMap.get(id))
            .filter((c): c is PersonalModelSourceChunkRecord => !!c);
        }
      }
    } catch (error) {
      console.warn("Cloudflare Vectorize search failed or disabled. Falling back to keyword search only. Error:", error);
    }
  }

  // 3. Merge results using Reciprocal Rank Fusion (RRF)
  // Constant k is standard 60
  const k = 60;
  const chunkMap = new Map<string, PersonalModelSourceChunkRecord>();
  const keywordRankMap = new Map<string, number>();
  const vectorRankMap = new Map<string, number>();

  // Populate chunk Map and ranks
  keywordChunks.forEach((chunk, index) => {
    chunkMap.set(chunk.id, chunk);
    keywordRankMap.set(chunk.id, index + 1);
  });

  vectorChunks.forEach((chunk, index) => {
    chunkMap.set(chunk.id, chunk);
    vectorRankMap.set(chunk.id, index + 1);
  });

  // Calculate RRF scores for all unique chunks
  const scores: SearchTraceItem[] = Array.from(chunkMap.keys()).map(chunkId => {
    const keywordRank = keywordRankMap.get(chunkId);
    const vectorRank = vectorRankMap.get(chunkId);

    const keywordScore = keywordRank ? 1 / (k + keywordRank) : 0;
    const vectorScore = vectorRank ? 1 / (k + vectorRank) : 0;
    const rrfScore = keywordScore + vectorScore;

    return {
      chunkId,
      keywordRank,
      vectorRank,
      rrfScore,
      vectorScore: vectorScoresMap.get(chunkId)
    };
  });

  // Sort by RRF score descending
  scores.sort((a, b) => b.rrfScore - a.rrfScore);

  // Take top-limit chunks
  const selectedScores = scores.slice(0, limit);
  const resultChunks = selectedScores
    .map(s => chunkMap.get(s.chunkId))
    .filter((c): c is PersonalModelSourceChunkRecord => !!c);

  return {
    chunks: resultChunks,
    trace: {
      keywordHits: keywordChunks.length,
      vectorHits: vectorChunks.length,
      mergedHits: scores.length,
      scores: selectedScores
    }
  };
}
