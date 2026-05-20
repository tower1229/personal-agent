import { createHash } from "node:crypto";
import { type MemoryType } from "../db/schema.js";

export function normalizeMemoryContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]+/g, "")
    .replace(/[，。！？、；：“”‘’（）【】《》「」『』…—·]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCanonicalKey(input: {
  userId?: string;
  type: MemoryType;
  normalizedContent: string;
}): string | null {
  const normalized = input.normalizedContent.trim();

  if (!normalized) {
    return null;
  }

  return createHash("sha256")
    .update(`${input.type}:${normalized}`)
    .digest("hex");
}
