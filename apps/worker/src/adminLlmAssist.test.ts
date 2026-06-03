import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { AdminLlmAssistService, type AdminLlmCapability } from "./adminLlmAssist.js";
import { createFakeRepositories } from "./test-helpers/fakeRepositories.js";
import * as llmModule from "./llm.js";

describe("adminLlmAssist", () => {
  const dummyInputSchema = z.object({ instruction: z.string() });
  const dummyDraftSchema = z.object({ items: z.array(z.string()) });

  const dummyCapability: AdminLlmCapability<typeof dummyInputSchema, typeof dummyDraftSchema> = {
    name: "test.capability",
    targetType: "test",
    inputSchema: dummyInputSchema,
    draftSchema: dummyDraftSchema,
    assemblePrompt: async () => ({
      systemPrompt: "System",
      userPrompt: "User",
      contextSummary: "Summary"
    })
  };

  let service: AdminLlmAssistService;
  let repositories: ReturnType<typeof createFakeRepositories>;

  beforeEach(() => {
    service = new AdminLlmAssistService();
    service.register(dummyCapability);
    repositories = createFakeRepositories();
    vi.restoreAllMocks();
  });

  it("throws error when LLM is not configured", async () => {
    const ctx = {
      env: { LLM_API_BASE_URL: "", LLM_API_KEY: "" } as any,
      repositories,
      ownerTgUserId: 1
    };

    await expect(
      service.run(ctx, "test.capability", "target-1", { instruction: "test" })
    ).rejects.toThrow("LLM is not configured");
  });

  it("returns warnings and saves failed run when JSON is totally invalid after 3 retries", async () => {
    const ctx = {
      env: { LLM_API_BASE_URL: "http://test", LLM_API_KEY: "test" } as any,
      repositories,
      ownerTgUserId: 1
    };

    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue({ content: "not json at all" })
    };
    vi.spyOn(llmModule, "createOpenAiCompatibleClient").mockReturnValue(mockLlm as any);

    const result = await service.run(ctx, "test.capability", "target-1", { instruction: "test" });
    
    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(3);
    expect(result.draft).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Unexpected token");

    const run = await repositories.getAdminAssistRun({ id: result.assistRunId, ownerTgUserId: 1 });
    expect(run?.status).toBe("failed");
    expect(run?.warningsJson).toContain("Unexpected token");
  });

  it("returns warnings when JSON is valid but fails schema parse after retries", async () => {
    const ctx = {
      env: { LLM_API_BASE_URL: "http://test", LLM_API_KEY: "test" } as any,
      repositories,
      ownerTgUserId: 1
    };

    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue({ content: `{"wrongField": []}` })
    };
    vi.spyOn(llmModule, "createOpenAiCompatibleClient").mockReturnValue(mockLlm as any);

    const result = await service.run(ctx, "test.capability", "target-1", { instruction: "test" });
    
    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(3);
    expect(result.draft).toBeNull();
    expect(result.warnings[0]).toContain("Required");

    const run = await repositories.getAdminAssistRun({ id: result.assistRunId, ownerTgUserId: 1 });
    expect(run?.status).toBe("failed");
  });

  it("retries on bad JSON and succeeds on subsequent attempt", async () => {
    const ctx = {
      env: { LLM_API_BASE_URL: "http://test", LLM_API_KEY: "test" } as any,
      repositories,
      ownerTgUserId: 1
    };

    const mockLlm = {
      createChatCompletion: vi.fn()
        .mockResolvedValueOnce({ content: "bad json {" })
        .mockResolvedValueOnce({ content: `{"items": ["item1", "item2"]}` })
    };
    vi.spyOn(llmModule, "createOpenAiCompatibleClient").mockReturnValue(mockLlm as any);

    const result = await service.run(ctx, "test.capability", "target-1", { instruction: "test" });
    
    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual([]);
    expect(result.draft).toEqual({ items: ["item1", "item2"] });

    const run = await repositories.getAdminAssistRun({ id: result.assistRunId, ownerTgUserId: 1 });
    expect(run?.status).toBe("completed");
    expect(run?.draftJson).toBe(JSON.stringify({ items: ["item1", "item2"] }));
  });

  it("succeeds with valid draft on first attempt", async () => {
    const ctx = {
      env: { LLM_API_BASE_URL: "http://test", LLM_API_KEY: "test" } as any,
      repositories,
      ownerTgUserId: 1
    };

    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue({ content: `\`\`\`json\n{"items": ["ok"]}\n\`\`\`` })
    };
    vi.spyOn(llmModule, "createOpenAiCompatibleClient").mockReturnValue(mockLlm as any);

    const result = await service.run(ctx, "test.capability", "target-1", { instruction: "test" });
    
    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(1);
    expect(result.draft).toEqual({ items: ["ok"] });

    const run = await repositories.getAdminAssistRun({ id: result.assistRunId, ownerTgUserId: 1 });
    expect(run?.status).toBe("completed");
    expect(run?.contextSummary).toBe("Summary");
  });
});
