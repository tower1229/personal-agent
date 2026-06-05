import {
  controlledToolNames,
  plannerRouteDecisionSchema,
  ROUTING_CONFIDENCE_CONFIRM_THRESHOLD,
  type PlannerRouteDecision
} from "@personal-agent/shared";
import { type BotRuntime } from "./bot.js";

const PLANNER_ROUTE_POLICY_VERSION = "planner-route-v1";

export interface UnifiedRoutingResult {
  semanticSkill: {
    matchedSkillName: string | null;
    confidence: number;
    reason: string;
    candidatesJson: string;
  } | null;
  taskComplexity: {
    mode: "simple" | "long_task";
    score: number;
    reason: string;
  } | null;
  plannerRoute: (PlannerRouteDecision & { source: "classifier"; classifierUsed: true }) | null;
}

export async function executeUnifiedRouting(input: {
  runtime: BotRuntime;
  text: string;
  ownerTgUserId: number;
  skillCatalog: any[];
  extractedUrls: string[];
  heuristicSignals: string[];
}): Promise<UnifiedRoutingResult> {
  if (!input.runtime.llmClient) {
    return { semanticSkill: null, taskComplexity: null, plannerRoute: null };
  }

  const systemPrompt = `你是个人 Agent 的统一路由调度器。你需要分析用户的输入，并同时进行技能匹配、任务复杂度分类以及Planner外部工具决策。
只输出一个严格的 JSON 对象（不要使用 markdown 代码块），包含三个顶层字段：
1. "semanticSkill": 包含 {"matchedSkillName": string|null, "confidence": number, "reason": string, "candidates": [{"name": string, "confidence": number, "reason": string}] }。只根据 skill 的 name/description/exampleIntents 匹配。如果没有合适的，matchedSkillName 为 null。confidence 低于 ${ROUTING_CONFIDENCE_CONFIRM_THRESHOLD} 时 matchedSkillName 必须为 null。
2. "taskComplexity": 包含 {"mode": "simple" | "long_task", "score": number, "reason": string}。long_task 表示需要多步规划、调研比较、跨工具连续执行。
3. "plannerRoute": 判断是否需要使用受控外部读取工具。包含字段：policyVersion(固定为"${PLANNER_ROUTE_POLICY_VERSION}"), mode("none"|"plan_guided"|"ask_user"), confidence(0-1), reason, candidateTools(只允许 ["web_search"], ["fetch_url"], 或 []), toolActionRisk("none"|"external_read"), freshnessRisk("low"|"medium"|"high"), privacyRisk("low"|"medium"|"high"), confirmationRequired(布尔值), searchPolicy{allowedTopics: string[], suggestedQueries: string[], forbiddenTerms: string[], redactionRequired: boolean, maxQueries: number}, fetchPolicy{explicitAllowedUrls: string[], allowSearchResultUrls: boolean, allowedDomains: string[], maxUrls: number}, signals: string[], classifierUsed: true, question(字符串或null)。`;

  const userContent = JSON.stringify({
    inputText: input.text,
    skills: input.skillCatalog,
    controlledTools: controlledToolNames,
    extractedUrls: input.extractedUrls,
    heuristicSignals: input.heuristicSignals
  });

  const completion = await input.runtime.llmClient.createChatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    thinkingTier: "none"
  });

  let parsed: any = null;
  try {
    const trimmed = completion.content.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
    const candidate = fenced?.[1] ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end >= start) {
      parsed = JSON.parse(candidate.slice(start, end + 1));
    }
  } catch {
    return { semanticSkill: null, taskComplexity: null, plannerRoute: null };
  }

  if (!parsed || typeof parsed !== "object") {
    return { semanticSkill: null, taskComplexity: null, plannerRoute: null };
  }

  let semanticSkill = null;
  if (parsed.semanticSkill) {
    const s = parsed.semanticSkill;
    semanticSkill = {
      matchedSkillName: typeof s.matchedSkillName === "string" ? s.matchedSkillName : null,
      confidence: typeof s.confidence === "number" ? s.confidence : 0,
      reason: typeof s.reason === "string" ? s.reason : "",
      candidatesJson: Array.isArray(s.candidates) ? JSON.stringify(s.candidates) : "[]"
    };
  }

  let taskComplexity = null;
  if (parsed.taskComplexity) {
    const t = parsed.taskComplexity;
    taskComplexity = {
      mode: (t.mode === "long_task" ? "long_task" : "simple") as "simple" | "long_task",
      score: typeof t.score === "number" ? t.score : 0,
      reason: typeof t.reason === "string" ? t.reason : ""
    };
  }

  let plannerRoute = null;
  if (parsed.plannerRoute) {
    const p = plannerRouteDecisionSchema.safeParse(parsed.plannerRoute);
    if (p.success) {
      plannerRoute = { ...p.data, source: "classifier" as const, classifierUsed: true as const };
    }
  }

  return { semanticSkill, taskComplexity, plannerRoute };
}
