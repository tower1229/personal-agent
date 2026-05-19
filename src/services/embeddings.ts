import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL
});

function generateDeterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(16).fill(0);

  for (const [index, char] of Array.from(text).entries()) {
    vector[index % vector.length] += char.codePointAt(0) ?? 0;
  }

  return vector.map((value) => value / 10_000);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.trim();

  if (!input) {
    throw new Error("Embedding input is empty");
  }

  if (process.env.DISABLE_EMBEDDINGS === "1") {
    throw new Error("Embedding generation is disabled");
  }

  if (process.env.EVAL_MOCK === "1") {
    return generateDeterministicEmbedding(input);
  }

  try {
    const response = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input
    });
    const embedding = response.data[0]?.embedding;

    if (!embedding?.length) {
      throw new Error("Embedding API returned an empty vector");
    }

    if (!embedding.every((value) => Number.isFinite(value))) {
      throw new Error("Embedding API returned a non-numeric vector");
    }

    return embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Embedding generation failed: ${message}`);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;

    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
