import { describe, expect, it } from "vitest";
import { evaluateRun } from "./agentEvaluator.js";
import { createFakeRepositories, env } from "./test-helpers/fakeRepositories.js";
import { type RunRecord } from "./repositories.js";

describe("evaluateRun", () => {
  it("should return null if run lacks responseText or contextTraceJson", async () => {
    const repos = createFakeRepositories();
    const runtime = {
      repositories: repos,
      now: () => Date.now(),
      generateId: () => "eval-id-1",
      generateApprovalCode: () => "123456",
      env
    };

    const run: RunRecord = {
      id: "run-1",
      ownerTgUserId: 1229,
      chatId: 1229,
      updateId: 1,
      messageText: "Hello",
      status: "succeeded",
      responseText: null,
      error: null,
      contextTraceJson: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await evaluateRun(run, runtime);
    expect(result).toBeNull();
  });

  it("should evaluate run correctly", async () => {
    const repos = createFakeRepositories();
    const mockLlmClient = {
      createChatCompletion: async () => ({
        content: "```json\n{\"groundednessScore\":5,\"oldDataMisuseScore\":4,\"adviceFitScore\":3,\"emotionalCalibrationScore\":5}\n```"
      })
    } as any;

    const runtime = {
      repositories: repos,
      now: () => Date.now(),
      generateId: () => "eval-id-2",
      generateApprovalCode: () => "123456",
      env,
      llmClient: mockLlmClient
    };

    const run: RunRecord = {
      id: "run-2",
      ownerTgUserId: 1229,
      chatId: 1229,
      updateId: 2,
      messageText: "What is my current project?",
      status: "succeeded",
      responseText: "You are working on Personal Agent.",
      error: null,
      contextTraceJson: JSON.stringify({
        scenario: "default",
        selectedClaimIds: ["claim-1"],
        excludedClaimIds: []
      }),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await evaluateRun(run, runtime);
    expect(result).not.toBeNull();
    expect(result?.groundednessScore).toBe(5);
    expect(result?.oldDataMisuseScore).toBe(4);
    expect(result?.adviceFitScore).toBe(3);
    expect(result?.emotionalCalibrationScore).toBe(5);
  });
});
