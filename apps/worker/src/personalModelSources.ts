export interface ChunkDraft {
  content: string;
  metadata: Record<string, unknown>;
}

export function normalizeSourceContent(content: string): string {
  return content.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function approximateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function splitLongBlock(block: string, maxLength: number): string[] {
  if (block.length <= maxLength) {
    return [block];
  }

  const chunks: string[] = [];
  for (let index = 0; index < block.length; index += maxLength) {
    chunks.push(block.slice(index, index + maxLength).trim());
  }
  return chunks.filter(Boolean);
}

export function chunkSourceContent(input: {
  content: string;
  sourceType: string;
  maxLength?: number;
}): ChunkDraft[] {
  const maxLength = input.maxLength ?? 1600;
  const normalized = input.content.trim();
  if (!normalized) {
    return [];
  }

  const blocks =
    input.sourceType === "writing" ||
    input.sourceType === "blog" ||
    input.sourceType === "manual_note"
      ? normalized
          .split(/\n(?=#{1,6}\s)|\n{2,}/u)
          .map((block) => block.trim())
          .filter(Boolean)
      : normalized
          .split(/\n{2,}/u)
          .map((block) => block.trim())
          .filter(Boolean);

  return blocks.flatMap((block, blockIndex) =>
    splitLongBlock(block, maxLength).map((content, splitIndex) => ({
      content,
      metadata: {
        blockIndex,
        splitIndex,
        tokenCount: approximateTokenCount(content)
      }
    }))
  );
}

export function tokenCountForChunk(content: string): number {
  return approximateTokenCount(content);
}
