import {
  indexDocumentChunks,
  listDocuments,
  searchDocumentChunks,
  updateDocumentIndexStatus
} from "../db/documents.js";
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
    await updateDocumentIndexStatus({
      userId: input.userId,
      documentId: input.documentId,
      status: "failed",
      error: "Document vector index deletion is not implemented for sqlite retriever.",
      indexedAt: null
    });
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
