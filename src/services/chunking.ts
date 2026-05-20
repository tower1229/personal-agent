import { type DocumentSourceType } from "../db/schema.js";

export type ChunkType =
  | "markdown_section"
  | "markdown_section_part"
  | "text_paragraph"
  | "text_paragraph_part"
  | "code_block";

export interface SplitDocumentInput {
  title: string;
  sourceType: DocumentSourceType;
  content: string;
  metadata?: Record<string, unknown>;
  maxChunkLength?: number;
  chunkOverlap?: number;
}

export interface SplitDocumentChunk {
  content: string;
  metadata: Record<string, unknown> & {
    sourceTitle: string;
    sourceType: DocumentSourceType;
    headingPath: string[];
    chunkType: ChunkType;
    originalChunkLength: number;
  };
}

interface MarkdownSection {
  headingPath: string[];
  content: string;
}

interface MarkdownBlock {
  type: "code" | "text";
  content: string;
}

const defaultChunkLength = 800;
const defaultChunkOverlap = 80;

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

function tailOverlap(content: string, overlap: number): string {
  if (overlap <= 0 || content.length <= overlap) {
    return "";
  }

  return content.slice(-overlap);
}

function splitLongText(input: {
  content: string;
  maxChunkLength: number;
  chunkOverlap: number;
}): string[] {
  const normalized = input.content.trim();

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + input.maxChunkLength, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - input.chunkOverlap, start + 1);
  }

  return chunks;
}

function baseMetadata(input: {
  title: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
  headingPath: string[];
  chunkType: ChunkType;
  originalChunkLength: number;
}): SplitDocumentChunk["metadata"] {
  return {
    ...(input.metadata ?? {}),
    sourceTitle: input.title,
    sourceType: input.sourceType,
    headingPath: input.headingPath,
    chunkType: input.chunkType,
    originalChunkLength: input.originalChunkLength
  };
}

function createChunk(input: {
  content: string;
  title: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
  headingPath: string[];
  chunkType: ChunkType;
  originalChunkLength: number;
}): SplitDocumentChunk | null {
  const content = input.content.trim();

  if (!content) {
    return null;
  }

  return {
    content,
    metadata: baseMetadata({
      title: input.title,
      sourceType: input.sourceType,
      metadata: input.metadata,
      headingPath: input.headingPath,
      chunkType: input.chunkType,
      originalChunkLength: input.originalChunkLength
    })
  };
}

function splitPlainText(input: {
  content: string;
  title: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
  maxChunkLength: number;
  chunkOverlap: number;
}): SplitDocumentChunk[] {
  const paragraphs = input.content
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: SplitDocumentChunk[] = [];
  let current = "";

  const flushCurrent = () => {
    if (!current.trim()) {
      return;
    }

    const chunk = createChunk({
      content: current,
      title: input.title,
      sourceType: input.sourceType,
      metadata: input.metadata,
      headingPath: [],
      chunkType: "text_paragraph",
      originalChunkLength: current.trim().length
    });

    if (chunk) {
      chunks.push(chunk);
    }

    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > input.maxChunkLength) {
      flushCurrent();

      for (const part of splitLongText({
        content: paragraph,
        maxChunkLength: input.maxChunkLength,
        chunkOverlap: input.chunkOverlap
      })) {
        const chunk = createChunk({
          content: part,
          title: input.title,
          sourceType: input.sourceType,
          metadata: input.metadata,
          headingPath: [],
          chunkType: "text_paragraph_part",
          originalChunkLength: paragraph.length
        });

        if (chunk) {
          chunks.push(chunk);
        }
      }

      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length > input.maxChunkLength) {
      const overlap = tailOverlap(current, input.chunkOverlap);

      flushCurrent();
      current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
    } else {
      current = next;
    }
  }

  flushCurrent();
  return chunks;
}

function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    const sectionContent = currentLines.join("\n").trim();

    if (sectionContent) {
      sections.push({
        headingPath: currentHeadingPath,
        content: sectionContent
      });
    }

    currentLines = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    const heading = !inCodeBlock ? /^(#{1,6})\s+(.+?)\s*$/.exec(line) : null;

    if (heading) {
      flush();

      const level = heading[1]?.length ?? 1;
      const text = heading[2]?.trim() ?? "";

      while (
        headingStack.length &&
        (headingStack.at(-1)?.level ?? 0) >= level
      ) {
        headingStack.pop();
      }

      headingStack.push({ level, text });
      currentHeadingPath = headingStack.map((item) => item.text);
    }

    currentLines.push(line);
  }

  flush();
  return sections;
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let buffer: string[] = [];
  let inCodeBlock = false;

  const flush = (type: MarkdownBlock["type"]) => {
    const text = buffer.join("\n").trim();

    if (text) {
      if (type === "text") {
        for (const paragraph of text
          .split(/\n\s*\n+/)
          .map((part) => part.trim())
          .filter(Boolean)) {
          blocks.push({ type, content: paragraph });
        }
      } else {
        blocks.push({ type, content: text });
      }
    }

    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inCodeBlock && buffer.length) {
        flush("text");
      }

      buffer.push(line);
      inCodeBlock = !inCodeBlock;

      if (!inCodeBlock) {
        flush("code");
      }

      continue;
    }

    buffer.push(line);
  }

  if (buffer.length) {
    flush(inCodeBlock ? "code" : "text");
  }

  return blocks;
}

function splitMarkdownSection(input: {
  section: MarkdownSection;
  title: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
  maxChunkLength: number;
  chunkOverlap: number;
}): SplitDocumentChunk[] {
  if (input.section.content.length <= input.maxChunkLength) {
    const chunk = createChunk({
      content: input.section.content,
      title: input.title,
      sourceType: input.sourceType,
      metadata: input.metadata,
      headingPath: input.section.headingPath,
      chunkType: "markdown_section",
      originalChunkLength: input.section.content.length
    });

    return chunk ? [chunk] : [];
  }

  const chunks: SplitDocumentChunk[] = [];
  const blocks = parseMarkdownBlocks(input.section.content);
  let current = "";

  const flushCurrent = () => {
    if (!current.trim()) {
      return;
    }

    const chunk = createChunk({
      content: current,
      title: input.title,
      sourceType: input.sourceType,
      metadata: input.metadata,
      headingPath: input.section.headingPath,
      chunkType: "markdown_section_part",
      originalChunkLength: input.section.content.length
    });

    if (chunk) {
      chunks.push(chunk);
    }

    current = "";
  };

  for (const block of blocks) {
    if (block.type === "code" && block.content.length > input.maxChunkLength) {
      flushCurrent();

      const chunk = createChunk({
        content: block.content,
        title: input.title,
        sourceType: input.sourceType,
        metadata: input.metadata,
        headingPath: input.section.headingPath,
        chunkType: "code_block",
        originalChunkLength: block.content.length
      });

      if (chunk) {
        chunks.push(chunk);
      }

      continue;
    }

    if (block.type === "text" && block.content.length > input.maxChunkLength) {
      flushCurrent();

      for (const part of splitLongText({
        content: block.content,
        maxChunkLength: input.maxChunkLength,
        chunkOverlap: input.chunkOverlap
      })) {
        const chunk = createChunk({
          content: part,
          title: input.title,
          sourceType: input.sourceType,
          metadata: input.metadata,
          headingPath: input.section.headingPath,
          chunkType: "markdown_section_part",
          originalChunkLength: input.section.content.length
        });

        if (chunk) {
          chunks.push(chunk);
        }
      }

      continue;
    }

    const separator = current ? "\n\n" : "";
    const next = `${current}${separator}${block.content}`;

    if (next.length > input.maxChunkLength) {
      const overlap = tailOverlap(current, input.chunkOverlap);

      flushCurrent();
      current = overlap ? `${overlap}\n\n${block.content}` : block.content;
    } else {
      current = next;
    }
  }

  flushCurrent();
  return chunks;
}

function splitMarkdown(input: {
  content: string;
  title: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
  maxChunkLength: number;
  chunkOverlap: number;
}): SplitDocumentChunk[] {
  return parseMarkdownSections(input.content).flatMap((section) =>
    splitMarkdownSection({
      section,
      title: input.title,
      sourceType: input.sourceType,
      metadata: input.metadata,
      maxChunkLength: input.maxChunkLength,
      chunkOverlap: input.chunkOverlap
    })
  );
}

export function splitDocumentIntoChunks(
  input: SplitDocumentInput
): SplitDocumentChunk[] {
  const content = normalizeContent(input.content);

  if (!content) {
    return [];
  }

  const maxChunkLength = input.maxChunkLength ?? defaultChunkLength;
  const chunkOverlap = Math.min(
    input.chunkOverlap ?? defaultChunkOverlap,
    Math.max(0, maxChunkLength - 1)
  );

  return input.sourceType === "markdown"
    ? splitMarkdown({
        content,
        title: input.title,
        sourceType: input.sourceType,
        metadata: input.metadata,
        maxChunkLength,
        chunkOverlap
      })
    : splitPlainText({
        content,
        title: input.title,
        sourceType: input.sourceType,
        metadata: input.metadata,
        maxChunkLength,
        chunkOverlap
      });
}
