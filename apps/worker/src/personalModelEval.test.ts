import { describe, expect, it } from "vitest";
import { assemblePersonalModelContext } from "./personalModelContext.js";
import { createFakeRepositories } from "./test-helpers/fakeRepositories.js";
import {
  type PersonalModelClaimRecord,
  type PersonalModelSourceDocumentRecord,
  type PersonalModelSourceChunkRecord
} from "./repositories.js";
import { type PersonalModelScenario } from "@personal-agent/shared";

describe("Personal Model Evaluation Harness (Golden Queries)", () => {
  const ownerTgUserId = 12345;
  const now = Date.now();

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
    createdAt: now,
    updatedAt: now
  };

  const baseDoc: Omit<PersonalModelSourceDocumentRecord, "id" | "sourceType" | "title" | "content" | "normalizedContent"> = {
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
    createdAt: now
  };

  // Define 21 Golden Queries spanning the 7 scenario buckets
  interface GoldenQueryCase {
    inputText: string;
    expectedScenario: PersonalModelScenario;
    description: string;
    expectedChunkId?: string;
    testLogic: (repositories: any, contextResult: any) => Promise<void> | void;
  }

  const goldenQueries: GoldenQueryCase[] = [
    // --- Bucket 1: Writing (3 queries) ---
    {
      inputText: "可以帮我看一下这段技术文章的段落吗",
      expectedScenario: "technical_writing",
      description: "Match technical writing keyword '技术文章'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("technical_writing");
      }
    },
    {
      inputText: "我想修改我写的那篇技术Readme文档",
      expectedScenario: "technical_writing",
      description: "Match technical writing keywords '文档' and 'readme'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("technical_writing");
      }
    },
    {
      inputText: "帮我润色一下这篇博客文章，看文风是否合适",
      expectedScenario: "writing",
      description: "Match writing keywords '文章' and '博客'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("writing");
      }
    },

    // --- Bucket 2: Health (3 queries) ---
    {
      inputText: "最近经常失眠，总是感觉很累",
      expectedScenario: "health",
      description: "Match health keywords '失眠' and '累'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("health");
        expect(result.trace.selectedClaimIds).toContain("claim-sleep");
      }
    },
    {
      inputText: "我每天睡不够，精力很差，总是疲劳",
      expectedScenario: "health",
      description: "Match health keywords '睡' and '疲劳'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("health");
      }
    },
    {
      inputText: "日常作息和饮食需要调整，想要恢复健康精力",
      expectedScenario: "health",
      description: "Match health keywords '作息' and '健康'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("health");
      }
    },

    // --- Bucket 3: Relationship (3 queries) ---
    {
      inputText: "我跟父母沟通有点困难",
      expectedScenario: "relationship",
      description: "Match relationship keywords '父母' and '沟通'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("relationship");
        expect(result.trace.selectedClaimIds).toContain("claim-family");
      }
    },
    {
      inputText: "和恋人吵架了该怎么办，如何进行有效的沟通",
      expectedScenario: "relationship",
      description: "Match relationship keywords '恋人' and '沟通'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("relationship");
      }
    },
    {
      inputText: "和同事之间如何做好沟通并维护边界",
      expectedScenario: "relationship",
      description: "Match relationship keywords '关系' and '沟通'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("relationship");
      }
    },

    // --- Bucket 4: Self-Knowledge (3 queries) ---
    {
      inputText: "我想了解我的MBTI测试结果",
      expectedScenario: "self_knowledge",
      description: "Match self_knowledge keywords 'MBTI' and '测试'",
      expectedChunkId: "chunk-mbti",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("self_knowledge");
        expect(result.trace.selectedChunkIds).toContain("chunk-mbti");
        expect(result.contextString).toContain("[Personality Framework]: MBTI: INTJ");
      }
    },
    {
      inputText: "探索一下我的性格特征和潜意识想法",
      expectedScenario: "self_knowledge",
      description: "Match self_knowledge keywords '性格' and '潜意识'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("self_knowledge");
      }
    },
    {
      inputText: "我的核心价值观和价值观体系是什么",
      expectedScenario: "self_knowledge",
      description: "Match self_knowledge keyword '性格'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("self_knowledge");
      }
    },

    // --- Bucket 5: Emotional Support (3 queries) ---
    {
      inputText: "今天心情特别烦躁，压力太大",
      expectedScenario: "emotional_support",
      description: "Match emotional support keywords '烦躁' and '压力'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("emotional_support");
      }
    },
    {
      inputText: "感到很焦虑，心情不太好，有些难受",
      expectedScenario: "emotional_support",
      description: "Match emotional support keywords '焦虑' and '难受'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("emotional_support");
      }
    },
    {
      inputText: "今天工作很不顺心，情绪有些压抑，感觉很沮丧",
      expectedScenario: "emotional_support",
      description: "Match emotional support keywords '情绪' and '沮丧'",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("emotional_support");
      }
    },

    // --- Bucket 6: Historical Data / Exclusion / Policy (3 queries) ---
    {
      inputText: "我想搜一下关于混合开发现状的原创文章",
      expectedScenario: "writing",
      description: "Verify retrieval of original writing prefix [Original Writing]",
      expectedChunkId: "chunk-hybrid-original",
      testLogic: async (repositories, result) => {
        expect(result.trace.selectedChunkIds).toContain("chunk-hybrid-original");
        expect(result.contextString).toContain("[Original Writing]: 混合应用开发非常重要");
      }
    },
    {
      inputText: "查一下关于混合应用的那篇do_not_use资料",
      expectedScenario: "global",
      description: "Verify that document marked usagePolicy = 'do_not_use' is completely excluded",
      testLogic: async (repositories, result) => {
        expect(result.trace.selectedChunkIds).not.toContain("chunk-hybrid-donotuse");
      }
    },
    {
      inputText: "我想看我以前发过的历史社交动态微博混合开发",
      expectedScenario: "writing",
      description: "Verify prefix [Historical Social Expression] for historical social export",
      expectedChunkId: "chunk-hybrid-historical",
      testLogic: async (repositories, result) => {
        expect(result.trace.selectedChunkIds).toContain("chunk-hybrid-historical");
        expect(result.contextString).toContain("[Historical Social Expression]: 历史混合开发微博");
      }
    },

    // --- Bucket 7: General / Out of Scope (3 queries) ---
    {
      inputText: "今天的天气怎么样？",
      expectedScenario: "global",
      description: "General query: should classify as global and match no claims/chunks",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("global");
        expect(result.trace.selectedChunkIds.length).toBe(0);
      }
    },
    {
      inputText: "请问 1 + 1 等于几？",
      expectedScenario: "global",
      description: "Math query: should classify as global and match no claims/chunks",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("global");
        expect(result.trace.selectedChunkIds.length).toBe(0);
      }
    },
    {
      inputText: "你好，最近怎么样？",
      expectedScenario: "global",
      description: "Greetings chitchat: should classify as global and match no claims/chunks",
      testLogic: async (repositories, result) => {
        expect(result.trace.scenario).toBe("global");
        expect(result.trace.selectedChunkIds.length).toBe(0);
      }
    }
  ];

  it("should evaluate all 21 Golden Queries against Context Assembler routing, matching, and safety constraints", async () => {
    const repositories = createFakeRepositories();

    // Setup 1: Mock claims for different scenarios
    await repositories.createPersonalModelClaim({
      ...baseClaim,
      id: "claim-sleep",
      scenario: "health",
      claim: "用户习惯晚睡，需要注意合理作息建议。"
    });
    await repositories.createPersonalModelClaim({
      ...baseClaim,
      id: "claim-family",
      scenario: "relationship",
      claim: "用户比较看重与父母的沟通，但偏于保守。"
    });
    await repositories.createPersonalModelClaim({
      ...baseClaim,
      id: "claim-global",
      scenario: "global",
      claim: "用户偏好平静、简练的对话回复风格。"
    });

    // Setup 2: Mock Personality Framework Source (agent-initiated type)
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-mbti",
      sourceType: "personality_framework",
      title: "MBTI Personality Interview",
      content: "MBTI: INTJ",
      metadataJson: JSON.stringify({ frameworkType: "MBTI", agreementLevel: "high" })
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-mbti",
      documentId: "doc-mbti",
      content: "MBTI: INTJ, 我想了解我的MBTI测试结果",
      normalizedContent: "mbti: intj, 我想了解我的mbti测试结果"
    });

    // Setup 3: Mock Original Blog Document
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-hybrid-original",
      sourceType: "blog",
      title: "2017混合应用开发现状",
      content: "混合应用开发非常重要",
      metadataJson: JSON.stringify({ isOriginal: true })
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-hybrid-original",
      documentId: "doc-hybrid-original",
      content: "混合应用开发非常重要, 我想搜一下关于混合开发现状的原创文章",
      normalizedContent: "混合应用开发非常重要, 我想搜一下关于混合开发现状的原创文章"
    });

    // Setup 4: Mock Cautious/Excluded Document ('do_not_use')
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-hybrid-donotuse",
      sourceType: "writing",
      title: "敏感或弃用文档",
      content: "这是一篇被禁用的混合应用文档",
      usagePolicy: "do_not_use"
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-hybrid-donotuse",
      documentId: "doc-hybrid-donotuse",
      content: "这是一篇被禁用的混合应用文档, 查一下关于混合应用的那篇do_not_use资料",
      normalizedContent: "这是一篇被禁用的混合应用文档, 查一下关于混合应用的那篇do_not_use资料"
    });

    // Setup 5: Mock Historical Social Expression Document
    await repositories.createPersonalModelSourceDocument({
      ...baseDoc,
      id: "doc-hybrid-historical",
      sourceType: "weibo_export",
      title: "旧微博动态",
      content: "历史混合开发微博",
      metadataJson: JSON.stringify({ isHistoricalExpression: true, platform: "weibo" })
    });
    await repositories.createPersonalModelSourceChunk({
      ...baseChunk,
      id: "chunk-hybrid-historical",
      documentId: "doc-hybrid-historical",
      content: "历史混合开发微博, 我想看我以前发过的历史社交动态微博混合开发",
      normalizedContent: "历史混合开发微博, 我想看我以前发过的历史社交动态微博混合开发"
    });

    // Setup 6: Initialize Gaps to satisfy self-healing check (so we don't pollute the logs of other tests)
    await repositories.createPersonalModelUnderstandingGap({
      id: "gap-existing",
      ownerTgUserId,
      scenario: "global",
      gapDescription: "测试用 Gap",
      status: "resolved",
      createdAt: now,
      updatedAt: now
    });

    // Run evaluation cases
    let evaluatedChunks = 0;
    let recalledInTop5 = 0;
    let recalledInTop10 = 0;

    for (const testCase of goldenQueries) {
      const result = await assemblePersonalModelContext({
        repositories,
        ownerTgUserId,
        inputText: testCase.inputText,
        now
      });

      try {
        await testCase.testLogic(repositories, result);

        // Compute Recall if applicable
        if (testCase.expectedChunkId) {
          evaluatedChunks++;
          const traceScores = result.trace.retrievalTrace?.scores || [];
          const index = traceScores.findIndex((s: any) => s.chunkId === testCase.expectedChunkId);
          const rank = index >= 0 ? index + 1 : -1;

          if (rank > 0 && rank <= 5) recalledInTop5++;
          if (rank > 0 && rank <= 10) recalledInTop10++;
        }
      } catch (error) {
        console.error(`Failed Golden Query: "${testCase.inputText}" (${testCase.description})`);
        throw error;
      }
    }

    if (evaluatedChunks > 0) {
      console.log(`\n[Golden Queries Eval] Total queries expecting chunks: ${evaluatedChunks}`);
      console.log(`[Golden Queries Eval] Recall@5: ${((recalledInTop5 / evaluatedChunks) * 100).toFixed(2)}%`);
      console.log(`[Golden Queries Eval] Recall@10: ${((recalledInTop10 / evaluatedChunks) * 100).toFixed(2)}%\n`);
    }
  });
});
