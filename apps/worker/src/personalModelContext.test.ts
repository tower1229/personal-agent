import { describe, expect, it } from "vitest";
import { classifyScenario, assemblePersonalModelContext } from "./personalModelContext.js";
import { createFakeRepositories } from "./test-helpers/fakeRepositories.js";
import { type PersonalModelClaimRecord, type PersonalModelSourceDocumentRecord, type PersonalModelSourceChunkRecord } from "./repositories.js";

describe("personalModelContext", () => {
  describe("classifyScenario", () => {
    it("should classify writing scenario", () => {
      expect(classifyScenario("我昨天写了一篇关于这方面的文章")).toBe("writing");
    });
    
    it("should classify relationship scenario", () => {
      expect(classifyScenario("我和朋友吵架了")).toBe("relationship");
    });

    it("should fallback to global if no keywords matched", () => {
      expect(classifyScenario("今天天气不错")).toBe("global");
    });
  });

  describe("assemblePersonalModelContext", () => {
    it("should select scenario claims and global claims, excluding other scenarios and do_not_use chunks", async () => {
      const repositories = createFakeRepositories();
      const ownerTgUserId = 123;
      const now = 1000;

      const baseClaim: Omit<PersonalModelClaimRecord, "id" | "scenario" | "claim"> = {
        ownerTgUserId,
        layer: "preference",
        confidence: "high",
        status: "active",
        usagePolicy: "default_available",
        sensitivity: "low",
        validFrom: null,
        validUntil: null,
        lastConfirmedAt: null,
        metadataJson: "{}",
        createdAt: 0,
        updatedAt: 0
      };

      await repositories.createPersonalModelClaim({ ...baseClaim, id: "c1", scenario: "writing", claim: "Writing claim 1" });
      await repositories.createPersonalModelClaim({ ...baseClaim, id: "c2", scenario: "global", claim: "Global claim 1" });
      await repositories.createPersonalModelClaim({ ...baseClaim, id: "c3", scenario: "health", claim: "Health claim 1" });

      const baseDoc: Omit<PersonalModelSourceDocumentRecord, "id" | "usagePolicy" | "status"> = {
        ownerTgUserId,
        sourceType: "manual_note",
        title: "Test doc",
        uri: null,
        content: "Test",
        normalizedContent: "test",
        sensitivity: "low",
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        ingestedAt: 0,
        metadataJson: "{}"
      };
      
      await repositories.createPersonalModelSourceDocument({ ...baseDoc, id: "doc1", usagePolicy: "default_available", status: "active" });
      await repositories.createPersonalModelSourceDocument({ ...baseDoc, id: "doc2", usagePolicy: "do_not_use", status: "active" });

      const baseChunk: Omit<PersonalModelSourceChunkRecord, "id" | "documentId" | "normalizedContent"> = {
        ownerTgUserId,
        chunkIndex: 0,
        content: "I like writing",
        tokenCount: null,
        metadataJson: "{}",
        createdAt: 0
      };

      await repositories.createPersonalModelSourceChunk({ ...baseChunk, id: "chunk1", documentId: "doc1", normalizedContent: "i like writing articles, 我正在写作" });
      await repositories.createPersonalModelSourceChunk({ ...baseChunk, id: "chunk2", documentId: "doc2", normalizedContent: "i like writing blogs but do not use" });

      const result = await assemblePersonalModelContext({
        repositories,
        ownerTgUserId,
        inputText: "我正在写作",
        now
      });

      expect(result.trace.scenario).toBe("writing");
      
      // Should include writing and global, but not health
      expect(result.trace.selectedClaimIds).toContain("c1");
      expect(result.trace.selectedClaimIds).toContain("c2");
      expect(result.trace.selectedClaimIds).not.toContain("c3");
      expect(result.trace.excludedClaimIds).toContain("c3");

      // Should include chunk1 but not chunk2 (because doc2 is do_not_use)
      expect(result.trace.selectedChunkIds).toContain("chunk1");
      expect(result.trace.selectedChunkIds).not.toContain("chunk2");

      expect(result.contextString).toContain("Writing claim 1");
      expect(result.contextString).toContain("Global claim 1");
      expect(result.contextString).toContain("I like writing");
    });
  });
});
