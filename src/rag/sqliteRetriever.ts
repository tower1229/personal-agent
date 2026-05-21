import {
  indexDocumentChunks,
  listDocuments,
  searchDocumentChunks
} from "../db/documents.js";
import { db } from "../db/client.js";
import {
  documentChunkEmbeddings,
  documentChunks,
  documents
} from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { type Retriever, type RetrievalResult } from "./retriever.js";

export class SqliteRetriever implements Retriever {
  async indexDocument(input: {
    userId: string;
    documentId: number;
  }): Promise<void> {
    await indexDocumentChunks(input);
  }

  async search(input: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<RetrievalResult[]> {
    return searchDocumentChunks(input);
  }

  async deleteDocument(input: {
    userId: string;
    documentId: number;
  }): Promise<void> {
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.userId, input.userId),
          eq(documentChunks.documentId, input.documentId)
        )
      );
    const chunkIds = chunks.map((chunk) => chunk.id);

    if (chunkIds.length) {
      await db
        .delete(documentChunkEmbeddings)
        .where(inArray(documentChunkEmbeddings.documentChunkId, chunkIds));
      await db
        .delete(documentChunks)
        .where(inArray(documentChunks.id, chunkIds));
    }

    await db
      .delete(documents)
      .where(
        and(
          eq(documents.userId, input.userId),
          eq(documents.id, input.documentId)
        )
      );
  }

  async rebuildUserIndex(input: { userId: string }): Promise<void> {
    const documents = await listDocuments(input.userId);

    for (const document of documents) {
      await this.indexDocument({
        userId: input.userId,
        documentId: document.id
      });
    }
  }
}
