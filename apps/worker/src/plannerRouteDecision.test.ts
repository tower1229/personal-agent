import { describe, expect, it } from "vitest";
import { decidePlannerRoute } from "./plannerRouteDecision.js";
import {
  createFakeLlmClient,
  createFakeRepositories
} from "./test-helpers/fakeRepositories.js";

function runtime() {
  const repositories = createFakeRepositories();
  let nextId = 1;
  return {
    repositories,
    runtime: {
      repositories,
      llmClient: createFakeLlmClient(),
      now: () => 1000,
      generateId: () => `id-${nextId++}`,
      generateApprovalCode: () => "123456"
    }
  };
}

async function decide(text: string) {
  const setup = runtime();
  const result = await decidePlannerRoute({
    runId: "run-1",
    ownerTgUserId: 1229,
    text,
    runtime: setup.runtime
  });
  return { ...setup, result };
}

describe("planner route decision", () => {
  it.each([
    ["你好", "none", []],
    ["二叉树是什么", "none", []],
    ["Cloudflare Workers 是什么", "plan_guided", ["web_search"]],
    ["搜索网页 Cloudflare Workers", "plan_guided", ["web_search"]],
    ["读取 https://example.com", "plan_guided", ["fetch_url"]],
    ["你知道最近 OpenAI Agents SDK 怎么样吗", "plan_guided", ["web_search"]],
    ["删除记忆 1", "none", []],
    ["记住我喜欢简洁回答", "none", []]
  ] as const)("routes %s", async (text, mode, candidateTools) => {
    const { result, repositories } = await decide(text);

    expect(result.decision.mode).toBe(mode);
    expect(result.decision.candidateTools).toEqual(candidateTools);
    expect(repositories.plannerRouteDecisions).toHaveLength(1);
    expect(repositories.plannerRouteDecisions[0]).toMatchObject({
      runId: "run-1",
      mode,
      candidateTools
    });
  });

  it("redacts medium privacy terms from search policy and persisted input", async () => {
    const { result, repositories } = await decide(
      "我和张三在谈离职，帮我查 OpenAI Agents SDK"
    );

    expect(result.decision.mode).toBe("plan_guided");
    expect(result.decision.privacyRisk).toBe("medium");
    expect(result.decision.searchPolicy.forbiddenTerms).toEqual(
      expect.arrayContaining(["张三", "离职"])
    );
    expect(result.decision.searchPolicy.suggestedQueries.join(" ")).not.toContain("张三");
    expect(repositories.plannerRouteDecisions[0]?.inputTextRedacted).not.toContain("张三");
  });

  it("asks for clarification when the target is ambiguous", async () => {
    const { result } = await decide("帮我看看这个");

    expect(result.decision.mode).toBe("ask_user");
    expect(result.decision.question).toContain("具体主题或 URL");
  });

  it("keeps explicit URLs in fetch policy", async () => {
    const { result } = await decide("读取 https://example.com#section");

    expect(result.decision.fetchPolicy.explicitAllowedUrls).toEqual([
      "https://example.com/"
    ]);
    expect(result.decision.fetchPolicy.allowedDomains).toEqual(["example.com"]);
  });

  it("allows run-local fetch_url after an allowed search result", async () => {
    const { result } = await decide("搜索 OpenAI Agents SDK，然后打开官方文档");

    expect(result.decision.mode).toBe("plan_guided");
    expect(result.decision.candidateTools).toEqual(["web_search", "fetch_url"]);
    expect(result.decision.fetchPolicy.allowSearchResultUrls).toBe(true);
  });
});
