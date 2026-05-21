import { type DocumentChunkSearchResult } from "../db/documents.js";

export type RetrievalResult = DocumentChunkSearchResult;

export interface Retriever {
  indexDocument(input: { userId: string; documentId: number }): Promise<void>;
  search(input: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<RetrievalResult[]>;
  deleteDocument(input: { userId: string; documentId: number }): Promise<void>;
  rebuildUserIndex(input: { userId: string }): Promise<void>;
}
