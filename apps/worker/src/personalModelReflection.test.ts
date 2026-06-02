import { describe, expect, it, vi } from "vitest";
import { reflectAndProposeClaims, cleanAndParseJson } from "./personalModelReflection.js";
import { executeLlmAgent, type AgentRuntime } from "./agent.js";
import { createFakeRepositories } from "./test-helpers/fakeRepositories.js";
import { type LlmClient } from "./llm.js";

describe("Personal Model Reflection", () => {
  describe("cleanAndParseJson", () => {
    it("should parse normal JSON", () => {
      const input = '{"proposals": []}';
      expect(cleanAndParseJson(input)).toEqual({ proposals: [] });
    });

    it("should strip markdown JSON code blocks", () => {
      const input = "```json\n{\n  \"proposals\": [\n    {\n      \"claim\": \"test\"\n    }\n  ]\n}\n```";
      expect(cleanAndParseJson(input)).toEqual({ proposals: [{ claim: "test" }] });
    });
  });

  describe("reflectAndProposeClaims", () => {
    it("should parse proposed claims and fallback invalid fields", async () => {
      const mockLlmClient: LlmClient = {
        createChatCompletion: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            proposals: [
              {
                claim: "用户写作时喜欢用长句",
                layer: "invalid-layer", // will fallback to 'preference'
                scenario: "writing",
                reason: "User said they write long posts."
              }
            ]
          }),
          toolCalls: []
        })
      };

      const result = await reflectAndProposeClaims({
        llmClient: mockLlmClient,
        inputText: "我写博客喜欢长篇大论",
        responseText: "明白了，我会注意你喜欢长篇大论。",
        existingClaims: []
      });

      expect(result).toHaveLength(1);
      expect(result[0].claim).toBe("用户写作时喜欢用长句");
      expect(result[0].layer).toBe("preference"); // fallback
      expect(result[0].scenario).toBe("writing");
      expect(result[0].reason).toBe("User said they write long posts.");
    });
  });

  describe("executeLlmAgent Integration", () => {
    it("should trigger reflection and append tip when keywords match", async () => {
      const repositories = createFakeRepositories();
      const ownerTgUserId = 12345;
      const now = Date.now();

      // Mock LLM client for both the agent response and reflection
      const mockLlmClient: LlmClient = {
        createChatCompletion: vi
          .fn()
          // First call: Agent response
          .mockResolvedValueOnce({
            content: "好的，我会记住你的写作习惯。",
            toolCalls: []
          })
          // Second call: Metacognitive reflection
          .mockResolvedValueOnce({
            content: JSON.stringify({
              proposals: [
                {
                  claim: "用户倾向于使用简洁的中文表达方式",
                  layer: "preference",
                  scenario: "writing",
                  reason: "用户提到喜欢简洁"
                }
              ]
            }),
            toolCalls: []
          })
      };

      const runtime: AgentRuntime = {
        repositories,
        llmClient: mockLlmClient,
        now: () => now,
        generateId: () => "id-123",
        generateApprovalCode: () => "code-123"
      };

      // Add an existing unresolved gap to avoid self-healing gaps trigger during test
      await repositories.createPersonalModelUnderstandingGap({
        id: "gap-1",
        ownerTgUserId,
        scenario: "global",
        gapDescription: "test gap",
        status: "resolved",
        createdAt: now,
        updatedAt: now
      });

      const agentResult = await executeLlmAgent({
        runId: "run-1",
        ownerTgUserId,
        inputText: "我以后写作要更简洁一点", // Trigger keyword: '写作'
        runtime,
        maxToolRounds: 3
      });

      // Verify the tip is appended
      expect(agentResult.responseText).toContain("💡 我可以把关于“用户倾向于使用简洁的中文表达方式”的理解作为低置信观察保存");

      // Verify database insertions
      const claims = await repositories.listPersonalModelClaims({
        ownerTgUserId,
        limit: 10
      });
      const proposedClaims = claims.filter(c => c.status === "proposed");
      expect(proposedClaims).toHaveLength(1);
      expect(proposedClaims[0].claim).toBe("用户倾向于使用简洁的中文表达方式");
      expect(proposedClaims[0].confidence).toBe("low");

      // Verify event creation
      const events = await repositories.listPersonalModelEvents({
        ownerTgUserId,
        claimId: proposedClaims[0].id,
        limit: 10
      });
      const proposedEvents = events.filter(e => e.eventType === "proposed");
      expect(proposedEvents).toHaveLength(1);
      expect(proposedEvents[0].claimId).toBe(proposedClaims[0].id);

      // Verify metacognition log creation
      const logs = await repositories.listPersonalModelMetacognitionLogs({
        ownerTgUserId,
        limit: 10,
        offset: 0
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].content).toContain("提出理解建议");
      expect(logs[0].relatedClaimId).toBe(proposedClaims[0].id);
    });

    it("should pass existing and rejected claims in prompts to prevent duplication", async () => {
      const repositories = createFakeRepositories();
      const ownerTgUserId = 12345;
      const now = Date.now();

      // Insert a deleted/rejected claim to D1
      await repositories.createPersonalModelClaim({
        id: "claim-rejected",
        ownerTgUserId,
        claim: "用户讨厌啰嗦的开头",
        layer: "preference",
        scenario: "writing",
        confidence: "low",
        status: "deleted", // rejected status
        usagePolicy: "default_available",
        sensitivity: "low",
        validFrom: null,
        validUntil: null,
        lastConfirmedAt: null,
        metadataJson: "{}",
        createdAt: now,
        updatedAt: now
      });

      // Mock LLM client
      const mockLlmClient: LlmClient = {
        createChatCompletion: vi
          .fn()
          // First call: Agent response
          .mockResolvedValueOnce({
            content: "收到你的反馈。",
            toolCalls: []
          })
          // Second call: Reflection (returns empty because user rejected it before)
          .mockResolvedValueOnce({
            content: JSON.stringify({ proposals: [] }),
            toolCalls: []
          })
      };

      const runtime: AgentRuntime = {
        repositories,
        llmClient: mockLlmClient,
        now: () => now,
        generateId: () => "id-123",
        generateApprovalCode: () => "code-123"
      };

      // Add dummy gap to bypass initialization gap logic
      await repositories.createPersonalModelUnderstandingGap({
        id: "gap-1",
        ownerTgUserId,
        scenario: "global",
        gapDescription: "test gap",
        status: "resolved",
        createdAt: now,
        updatedAt: now
      });

      await executeLlmAgent({
        runId: "run-2",
        ownerTgUserId,
        inputText: "我以后写作不要啰嗦的开头",
        runtime,
        maxToolRounds: 3
      });

      // Verify existing rejected claim was passed to the reflection prompt (the second LLM call)
      const reflectionCalls = mockLlmClient.createChatCompletion as any;
      const reflectionArgs = reflectionCalls.mock.calls[1][0];
      const reflectionSystemInstruction = reflectionArgs.messages[0].content;
      
      expect(reflectionSystemInstruction).toContain("[deleted]");
      expect(reflectionSystemInstruction).toContain("用户讨厌啰嗦的开头");
    });
  });
});
