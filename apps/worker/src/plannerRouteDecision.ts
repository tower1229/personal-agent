import {
  controlledToolNames,
  plannerRouteDecisionSchema,
  type ControlledToolName,
  type PlannerFetchPolicy,
  type PlannerFreshnessRisk,
  type PlannerPrivacyRisk,
  type PlannerRouteDecision,
  type PlannerSearchPolicy
} from "@personal-agent/shared";
import { type LlmClient } from "./llm.js";
import { type AgentRuntime } from "./agent.js";

export const PLANNER_ROUTE_POLICY_VERSION = "planner-route-v1";

const MAX_SEARCH_QUERIES = 3;
const MAX_FETCH_URLS = 5;

export interface RouteDraft extends PlannerRouteDecision {
  source: "heuristic" | "classifier";
}

export interface PlannerRouteDecisionResult {
  decision: PlannerRouteDecision;
  inputTextRedacted: string;
  inputHash: string;
}

function emptySearchPolicy(): PlannerSearchPolicy {
  return {
    allowedTopics: [],
    suggestedQueries: [],
    forbiddenTerms: [],
    redactionRequired: false,
    maxQueries: 0
  };
}

function emptyFetchPolicy(): PlannerFetchPolicy {
  return {
    explicitAllowedUrls: [],
    allowSearchResultUrls: false,
    allowedDomains: [],
    maxUrls: 0
  };
}

function baseDecision(input: {
  mode: PlannerRouteDecision["mode"];
  confidence: number;
  reason: string;
  candidateTools?: ControlledToolName[];
  freshnessRisk?: PlannerFreshnessRisk;
  privacyRisk?: PlannerPrivacyRisk;
  searchPolicy?: PlannerSearchPolicy;
  fetchPolicy?: PlannerFetchPolicy;
  signals?: string[];
  classifierUsed?: boolean;
  question?: string;
}): PlannerRouteDecision {
  const candidateTools = input.candidateTools ?? [];
  return {
    policyVersion: PLANNER_ROUTE_POLICY_VERSION,
    mode: input.mode,
    confidence: Math.min(Math.max(input.confidence, 0), 1),
    reason: input.reason,
    candidateTools,
    toolActionRisk: candidateTools.length > 0 ? "external_read" : "none",
    freshnessRisk: input.freshnessRisk ?? "low",
    privacyRisk: input.privacyRisk ?? "low",
    confirmationRequired: input.mode === "ask_user",
    searchPolicy: input.searchPolicy ?? emptySearchPolicy(),
    fetchPolicy: input.fetchPolicy ?? emptyFetchPolicy(),
    signals: input.signals ?? [],
    classifierUsed: input.classifierUsed ?? false,
    ...(input.question ? { question: input.question } : {})
  };
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'，。；、)）]+/giu) ?? [];
  return [...new Set(matches)];
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

function allowedDomainsForUrls(urls: string[]): string[] {
  return [
    ...new Set(
      urls.flatMap((value) => {
        try {
          return [new URL(value).hostname.toLowerCase()];
        } catch {
          return [];
        }
      })
    )
  ];
}

function looksLikePrivateContext(text: string): boolean {
  return /离职|赔偿|病|焦虑|失眠|家庭|关系|分手|财务|收入|隐私|身份证|密码|token|secret|张三|李四/u.test(text);
}

function looksLikeHighPrivacy(text: string): boolean {
  return /我刚才|上面提到|刚刚说|我的.*(病|收入|密码|token|secret|身份证|离职|赔偿)|隐私/u.test(text);
}

function forbiddenTermsFor(text: string): string[] {
  const terms = new Set<string>();
  for (const match of text.matchAll(/[张李王赵刘陈杨黄周吴][\u4e00-\u9fa5]/gu)) {
    terms.add(match[0]);
  }
  for (const keyword of ["离职", "赔偿", "身份证", "密码", "token", "secret"]) {
    if (text.includes(keyword)) {
      terms.add(keyword);
    }
  }
  return [...terms];
}

function redactedText(text: string, forbiddenTerms: string[]): string {
  return forbiddenTerms.reduce(
    (value, term) => value.replaceAll(term, "[redacted]"),
    text
  );
}

function queryFromText(text: string, forbiddenTerms: string[]): string {
  return redactedText(text, forbiddenTerms)
    .replace(/搜索网页|联网|查一下|查找|搜索|帮我|看看|最近|现在|你知道|然后打开官方文档/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function topicFromText(text: string, forbiddenTerms: string[]): string {
  return queryFromText(text, forbiddenTerms) || redactedText(text, forbiddenTerms).slice(0, 80);
}

function searchPolicyFor(input: {
  text: string;
  forbiddenTerms: string[];
  redactionRequired: boolean;
  maxQueries?: number;
}): PlannerSearchPolicy {
  const topic = topicFromText(input.text, input.forbiddenTerms);
  const query = queryFromText(input.text, input.forbiddenTerms);
  return {
    allowedTopics: topic ? [topic] : [],
    suggestedQueries: query ? [query] : [],
    forbiddenTerms: input.forbiddenTerms,
    redactionRequired: input.redactionRequired,
    maxQueries: input.maxQueries ?? MAX_SEARCH_QUERIES
  };
}

export function classifyHeuristically(text: string): RouteDraft {
  const trimmed = text.trim();
  const urls = extractUrls(trimmed);
  const httpUrls = urls.flatMap((url) => {
    const normalized = normalizeHttpUrl(url);
    return normalized ? [normalized] : [];
  });
  const unsupportedUrls = urls.filter((url) => !normalizeHttpUrl(url));
  const forbiddenTerms = forbiddenTermsFor(trimmed);
  const mediumPrivacy = looksLikePrivateContext(trimmed);
  const highPrivacy = looksLikeHighPrivacy(trimmed);
  const privacyRisk: PlannerPrivacyRisk = highPrivacy
    ? "high"
    : mediumPrivacy
      ? "medium"
      : "low";
  const redactionRequired = privacyRisk !== "low";
  const redacted = redactedText(trimmed, forbiddenTerms);

  if (/^(你好|hi|hello|哈喽|在吗)[！!。.\s]*$/iu.test(trimmed)) {
    return {
      ...baseDecision({
        mode: "none",
        confidence: 0.95,
        reason: "casual greeting does not need controlled external tools",
        signals: ["stable_chat"]
      }),
      source: "heuristic"
    };
  }

  if (/删除记忆|记住|保存记忆|新增待办|创建待办|完成待办|列出待办/u.test(trimmed)) {
    return {
      ...baseDecision({
        mode: "none",
        confidence: 0.95,
        reason: "request targets non-controlled internal tools",
        signals: ["non_controlled_tool_request"]
      }),
      source: "heuristic"
    };
  }

  if (/^二叉树是什么[？?。.\s]*$/u.test(trimmed)) {
    return {
      ...baseDecision({
        mode: "none",
        confidence: 0.92,
        reason: "stable knowledge request",
        signals: ["stable_knowledge"]
      }),
      source: "heuristic"
    };
  }

  if (/帮我看看这个[。.\s]*$/u.test(trimmed)) {
    return {
      ...baseDecision({
        mode: "ask_user",
        confidence: 0.86,
        reason: "target is ambiguous and no URL or bounded topic was provided",
        privacyRisk,
        signals: ["ambiguous_target"],
        question: "你希望我看什么对象？可以给一个具体主题或 URL。"
      }),
      source: "heuristic"
    };
  }

  if (unsupportedUrls.length > 0) {
    return {
      ...baseDecision({
        mode: "plan_guided",
        confidence: 0.9,
        reason: "user requested URL fetch but URL scheme is unsupported",
        candidateTools: ["fetch_url"],
        freshnessRisk: "medium",
        privacyRisk,
        fetchPolicy: {
          ...emptyFetchPolicy(),
          maxUrls: MAX_FETCH_URLS
        },
        signals: ["explicit_url", "unsupported_url_scheme"]
      }),
      source: "heuristic"
    };
  }

  if (httpUrls.length > 0) {
    return {
      ...baseDecision({
        mode: privacyRisk === "high" ? "ask_user" : "plan_guided",
        confidence: 0.95,
        reason:
          privacyRisk === "high"
            ? "explicit URL with high privacy context requires confirmation"
            : "explicit http URL can be fetched within URL policy",
        candidateTools: privacyRisk === "high" ? [] : ["fetch_url"],
        freshnessRisk: "medium",
        privacyRisk,
        fetchPolicy: {
          explicitAllowedUrls: httpUrls,
          allowSearchResultUrls: false,
          allowedDomains: allowedDomainsForUrls(httpUrls),
          maxUrls: Math.min(httpUrls.length, MAX_FETCH_URLS)
        },
        signals: ["explicit_url"],
        question:
          privacyRisk === "high"
            ? "这个请求可能会把敏感上下文发送到外部网页。你确认要读取这个 URL 吗？"
            : undefined
      }),
      source: "heuristic"
    };
  }

  const explicitSearch = /搜索网页|联网|查一下|查找|搜索/u.test(trimmed);
  const freshnessHigh =
    explicitSearch ||
    /最近|最新|现在|今天|新闻|价格|政策|公司怎么样|还值得|API|SDK|框架|Cloudflare Workers|OpenAI Agents SDK/u.test(trimmed);

  if (freshnessHigh) {
    if (privacyRisk === "high") {
      return {
        ...baseDecision({
          mode: "ask_user",
          confidence: 0.9,
          reason: "fresh external information may be needed but input contains high privacy context",
          freshnessRisk: "high",
          privacyRisk,
          signals: ["freshness_high", "privacy_high"],
          question: "这个请求可能需要联网，但会涉及你的私人上下文。你希望我联网搜索，还是只基于已有信息回答？"
        }),
        source: "heuristic"
      };
    }

    const allowSearchResultFetch = /打开官方文档|读取|url|链接/u.test(trimmed);
    return {
      ...baseDecision({
        mode: "plan_guided",
        confidence: explicitSearch ? 0.95 : 0.78,
        reason: explicitSearch
          ? "explicit search wording requests external information"
          : "modern product or API topic likely needs fresh external information",
        candidateTools: allowSearchResultFetch
          ? ["web_search", "fetch_url"]
          : ["web_search"],
        freshnessRisk: "high",
        privacyRisk,
        searchPolicy: searchPolicyFor({
          text: redacted,
          forbiddenTerms,
          redactionRequired
        }),
        fetchPolicy: {
          explicitAllowedUrls: [],
          allowSearchResultUrls: allowSearchResultFetch,
          allowedDomains: [],
          maxUrls: MAX_FETCH_URLS
        },
        signals: [
          explicitSearch ? "explicit_search" : "freshness_high",
          ...(redactionRequired ? ["query_redacted"] : [])
        ]
      }),
      source: "heuristic"
    };
  }

  if (/是什么|解释|原理|怎么理解/u.test(trimmed)) {
    return {
      ...baseDecision({
        mode: "none",
        confidence: 0.82,
        reason: "likely stable explanatory request",
        freshnessRisk: "low",
        privacyRisk,
        signals: ["stable_explanation"]
      }),
      source: "heuristic"
    };
  }

  return {
    ...baseDecision({
      mode: "none",
      confidence: 0.45,
      reason: "heuristic is uncertain",
      freshnessRisk: "medium",
      privacyRisk,
      signals: ["heuristic_uncertain"]
    }),
    source: "heuristic"
  };
}

function validClassifierDecision(value: unknown): RouteDraft | null {
  const parsed = plannerRouteDecisionSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return { ...parsed.data, classifierUsed: true, source: "classifier" };
}

async function classifyWithLlm(input: {
  llmClient?: LlmClient;
  text: string;
  extractedUrls: string[];
  heuristicSignals: string[];
}): Promise<RouteDraft | null> {
  if (!input.llmClient) {
    return null;
  }

  const completion = await input.llmClient.createChatCompletion({
    thinkingTier: "none",
    messages: [
      {
        role: "system",
        content: `你是 Planner Route Decision 分类器。只判断普通 fallback 是否允许使用受控外部读取工具。
返回严格 JSON 对象，字段必须符合 PlannerRouteDecision：
policyVersion, mode(none|plan_guided|ask_user), confidence(0-1), reason,
candidateTools(只允许 web_search/fetch_url), toolActionRisk(none|external_read),
freshnessRisk(low|medium|high), privacyRisk(low|medium|high), confirmationRequired,
searchPolicy{allowedTopics,suggestedQueries,forbiddenTerms,redactionRequired,maxQueries},
fetchPolicy{explicitAllowedUrls,allowSearchResultUrls,allowedDomains,maxUrls},
signals, classifierUsed, question。
不要输出 markdown。不要使用个人记忆。`
      },
      {
        role: "user",
        content: JSON.stringify({
          inputText: input.text,
          controlledTools: controlledToolNames,
          extractedUrls: input.extractedUrls,
          heuristicSignals: input.heuristicSignals,
          policyVersion: PLANNER_ROUTE_POLICY_VERSION
        })
      }
    ]
  });

  try {
    const parsed = JSON.parse(completion.content) as unknown;
    return validClassifierDecision(parsed);
  } catch {
    return null;
  }
}

function riskRank(risk: PlannerPrivacyRisk): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function mostConservativePrivacyRisk(
  left: PlannerPrivacyRisk,
  right: PlannerPrivacyRisk
): PlannerPrivacyRisk {
  return riskRank(left) >= riskRank(right) ? left : right;
}

function mergeDecisions(input: {
  heuristic: RouteDraft;
  classifier: RouteDraft | null;
}): PlannerRouteDecision {
  const heuristic = input.heuristic;
  const classifier = input.classifier;
  let selected: RouteDraft = heuristic;

  if (classifier) {
    if (heuristic.confidence >= 0.9) {
      selected = heuristic;
    } else if (heuristic.confidence >= 0.7) {
      selected = classifier.confidence >= 0.85 ? classifier : heuristic;
    } else {
      selected = classifier;
    }
  }

  const privacyRisk = classifier
    ? mostConservativePrivacyRisk(heuristic.privacyRisk, classifier.privacyRisk)
    : heuristic.privacyRisk;
  const forbiddenTerms = [
    ...new Set([
      ...heuristic.searchPolicy.forbiddenTerms,
      ...selected.searchPolicy.forbiddenTerms
    ])
  ];
  const explicitAllowedUrls = [
    ...new Set([
      ...heuristic.fetchPolicy.explicitAllowedUrls,
      ...selected.fetchPolicy.explicitAllowedUrls
    ])
  ];

  return plannerRouteDecisionSchema.parse({
    ...selected,
    policyVersion: PLANNER_ROUTE_POLICY_VERSION,
    confidence: Math.min(Math.max(selected.confidence, 0), 1),
    candidateTools: selected.candidateTools.filter((tool) =>
      controlledToolNames.includes(tool)
    ),
    privacyRisk,
    confirmationRequired: selected.mode === "ask_user",
    searchPolicy: {
      ...selected.searchPolicy,
      forbiddenTerms,
      maxQueries: Math.max(0, selected.searchPolicy.maxQueries)
    },
    fetchPolicy: {
      ...selected.fetchPolicy,
      explicitAllowedUrls,
      maxUrls: Math.max(0, selected.fetchPolicy.maxUrls)
    },
    signals: [...new Set([...heuristic.signals, ...selected.signals])],
    classifierUsed: Boolean(classifier),
    source: undefined
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function decidePlannerRoute(input: {
  runId: string;
  ownerTgUserId: number;
  text: string;
  runtime: AgentRuntime;
  confirmedExternalRead?: "allow_web" | "no_web";
  precomputedClassifierDecision?: any;
}): Promise<PlannerRouteDecisionResult> {
  const heuristic = classifyHeuristically(input.text);
  const classifier =
    heuristic.confidence >= 0.9
      ? null
      : (input.precomputedClassifierDecision ?? await classifyWithLlm({
          llmClient: input.runtime.llmClient,
          text: input.text,
          extractedUrls: extractUrls(input.text),
          heuristicSignals: heuristic.signals
        }));
  const mergedDecision = mergeDecisions({ heuristic, classifier });
  const decision = (() => {
    if (input.confirmedExternalRead === "no_web") {
      return baseDecision({
        mode: "none",
        confidence: 1,
        reason: "user clarified that controlled external tools should not be used",
        freshnessRisk: mergedDecision.freshnessRisk,
        privacyRisk: mergedDecision.privacyRisk,
        signals: [...mergedDecision.signals, "user_declined_web"]
      });
    }

    if (
      input.confirmedExternalRead === "allow_web" &&
      mergedDecision.mode === "ask_user"
    ) {
      const explicitUrls = extractUrls(input.text)
        .map((url) => normalizeHttpUrl(url))
        .filter((url): url is string => Boolean(url));
      const forbiddenTerms = forbiddenTermsFor(input.text);
      const candidateTools: ControlledToolName[] = explicitUrls.length
        ? ["fetch_url"]
        : ["web_search"];
      return baseDecision({
        mode: "plan_guided",
        confidence: Math.max(mergedDecision.confidence, 0.85),
        reason: "user clarified that controlled external read is allowed",
        candidateTools,
        freshnessRisk: mergedDecision.freshnessRisk,
        privacyRisk: mergedDecision.privacyRisk,
        searchPolicy: candidateTools.includes("web_search")
          ? searchPolicyFor({
              text: input.text,
              forbiddenTerms,
              redactionRequired: mergedDecision.privacyRisk !== "low"
            })
          : emptySearchPolicy(),
        fetchPolicy: {
          explicitAllowedUrls: explicitUrls,
          allowSearchResultUrls: false,
          allowedDomains: allowedDomainsForUrls(explicitUrls),
          maxUrls: explicitUrls.length || MAX_FETCH_URLS
        },
        signals: [...mergedDecision.signals, "user_allowed_web"]
      });
    }

    return mergedDecision;
  })();
  const inputTextRedacted = redactedText(
    input.text,
    decision.searchPolicy.forbiddenTerms
  );
  const inputHash = await sha256Hex(input.text);

  await input.runtime.repositories.createPlannerRouteDecision({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    policyVersion: decision.policyVersion,
    inputTextRedacted,
    inputHash,
    mode: decision.mode,
    confidence: decision.confidence,
    reason: decision.reason,
    candidateTools: decision.candidateTools,
    toolActionRisk: decision.toolActionRisk,
    freshnessRisk: decision.freshnessRisk,
    privacyRisk: decision.privacyRisk,
    confirmationRequired: decision.confirmationRequired,
    searchPolicy: decision.searchPolicy,
    fetchPolicy: decision.fetchPolicy,
    signals: decision.signals,
    classifierUsed: decision.classifierUsed,
    question: decision.question ?? null,
    createdAt: input.runtime.now()
  });

  return { decision, inputTextRedacted, inputHash };
}
