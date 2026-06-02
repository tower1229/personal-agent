# Planner Route Decision

## Goal

Make the decision to use the lightweight planner explicit, stable, auditable, and privacy-aware for ordinary LLM fallback requests.

The route decision only controls tools with clear routing value in the first version: `web_search` and `fetch_url`. Other tools stay available through the existing agent/tool safety model so agent capability is not reduced unnecessarily.

The target engineering posture is optimistic tool availability with narrow, explicit guardrails:

- Route only when the downstream behavior materially differs.
- Keep low-risk tools available by default.
- Apply tool-level input/output guardrails to controlled tools at invocation time.
- Trace routing, guardrail decisions, and tool execution as one run-level record.
- Treat web/search content as untrusted data that can inform answers but cannot change system, developer, or user instructions.

This follows current mainstream agent practice: routing separates distinct downstream paths, tool safeguards are applied per tool call, and traces record LLM generations, tool calls, guardrails, and custom events for production debugging and evals.

## Non-Goals

- Do not route built-in commands, explicit/semantic skills, or long tasks through this layer.
- Do not make planner routing the authorization layer for every tool.
- Do not require explicit user wording such as "search" before the agent can use the web.
- Do not add Telegram inline callback or long-lived pending state for planner clarification in the first version.
- Do not store full raw classifier prompts or outputs in D1.
- Do not let `fetch_url` browse arbitrary URLs outside explicit user URLs or URLs returned by an allowed `web_search` call in the same run.
- Do not treat search results or fetched webpages as trusted instructions.

## Routing Position

Planner route decision runs only after the existing routes have declined or completed:

```text
built-in command
  -> semantic skill routing
  -> long-task complexity classifier
  -> planner route decision
  -> ordinary LLM fallback / plan-guided fallback
```

Long task remains the stronger execution mode. Planner routing only decides whether a short ordinary fallback request should enable plan-guided use of controlled external tools.

## Controlled Tools

First version controlled tools:

```text
web_search
fetch_url
```

All other tools remain available unless restricted by existing skill allowlists or tool-level safety:

```text
create_todo
list_todos
complete_todo
save_memory
search_memory
delete_memory_request
record_understanding_gap
record_metacognition_log
save_interview_source
```

`delete_memory_request` continues to rely on the existing approval mechanism. Internal personal-model tools are not routed by planner route decision in the first version.

## Decision Shape

```ts
type PlannerRouteMode = "none" | "plan_guided" | "ask_user";
type ControlledToolName = "web_search" | "fetch_url";

interface PlannerRouteDecision {
  policyVersion: string;
  mode: PlannerRouteMode;
  confidence: number;
  reason: string;
  candidateTools: ControlledToolName[];
  toolActionRisk: "none" | "external_read";
  freshnessRisk: "low" | "medium" | "high";
  privacyRisk: "low" | "medium" | "high";
  confirmationRequired: boolean;
  searchPolicy: {
    allowedTopics: string[];
    suggestedQueries: string[];
    forbiddenTerms: string[];
    redactionRequired: boolean;
    maxQueries: number;
  };
  fetchPolicy: {
    explicitAllowedUrls: string[];
    allowSearchResultUrls: boolean;
    allowedDomains: string[];
    maxUrls: number;
  };
  signals: string[];
  classifierUsed: boolean;
  question?: string;
}
```

`candidateTools` contains only controlled tools. It is not a full list of tools available to the agent.

`toolActionRisk` describes whether the controlled tool performs an external read. `web_search` and `fetch_url` are read-only with respect to remote state, but they still send data externally, so privacy is tracked separately via `privacyRisk`, `searchPolicy.forbiddenTerms`, and `searchPolicy.redactionRequired`.

`policyVersion` must change whenever thresholds, merge behavior, query policy, URL policy, or classifier prompts materially change.

## Modes

### `none`

No plan-guided controlled external tool use is authorized.

The agent may still use non-controlled tools through the existing tool loop and tool-specific safety checks. If the model attempts `web_search` or `fetch_url`, that controlled tool call must be blocked and recorded as a deviation.

### `plan_guided`

The ordinary fallback invokes the lightweight execution planner. The execution planner may only plan controlled tools listed in `candidateTools`, and it must stay within `searchPolicy` and `fetchPolicy`.

Non-controlled tools remain available through the existing tool loop.

The execution planner is not a global authorization system. It proposes a bounded controlled-tool path; actual tool calls are still checked by tool-level guardrails at invocation time.

### `ask_user`

The route decision returns one short clarification question and ends the current run. The system does not enter the LLM agent loop.

Example:

```text
你是希望我联网搜索最新资料，还是只基于已有知识解释？
```

The user response naturally enters a new routing pass.

To avoid losing context on short replies such as `是` or `确认`, the system should persist a short-lived pending route clarification:

```ts
interface PendingPlannerRouteClarification {
  runId: string;
  ownerTgUserId: number;
  question: string;
  options: ("allow_web" | "no_web" | "provide_url" | "clarify_target")[];
  expiresAt: number;
}
```

The first version can avoid Telegram inline callbacks, but it should still use the pending clarification when the next owner message arrives. If the pending clarification is expired or the next message is unrelated, route normally.

## Freshness And Privacy

Automatic web use is allowed when the agent judges external information is needed. The decision should not require the user to explicitly say "search".

Use `freshnessRisk` to decide whether current external information is likely needed:

- `high`: modern products, APIs, companies, policies, prices, schedules, news, current recommendations, or anything likely to drift.
- `medium`: facts that may drift but are not obviously time-sensitive.
- `low`: stable concepts, math, general reasoning, personal advice, or local conversation context.

Use `privacyRisk` to decide how much of the user input may be sent externally:

- `low`: public topic or generic technical/product query.
- `medium`: user context contains private side details; search query should be redacted.
- `high`: sensitive personal content where automatic external send is unsafe; return `ask_user`.

Decision rule:

```text
freshnessRisk=high + privacyRisk=low/medium -> plan_guided
freshnessRisk=high + privacyRisk=high -> ask_user
freshnessRisk=medium -> confidence decides plan_guided vs ask_user vs none
freshnessRisk=low -> usually none
```

Privacy handling rules:

- For `privacyRisk=medium`, remove names, private relationships, local identifiers, private project details, and irrelevant personal context from search queries.
- For `privacyRisk=high`, do not call controlled external tools unless the user explicitly approves the data exposure in the clarification response.
- The classifier and execution planner must not receive personal-model memories. They may receive only the current user input, extracted URLs, controlled tool list, and redacted heuristic signals.
- Persist redacted routing data by default; keep raw user text in the existing run record only if that is already part of the run storage model.

## Queries And URLs

The route decision constrains what can be sent externally.

For `web_search`:

- `suggestedQueries` are preferred queries, not exact string allowlists.
- A query may be rewritten if it stays within `searchPolicy.allowedTopics`, avoids `searchPolicy.forbiddenTerms`, and respects redaction.
- The tool guardrail should block a query when it contains forbidden private terms, broadens the topic beyond the user request, exceeds `maxQueries`, or conflicts with `privacyRisk`.
- If the system cannot construct a bounded redacted query, prefer `ask_user` or `none` rather than unbounded search.

For `fetch_url`:

- `fetch_url.url` may exactly match `fetchPolicy.explicitAllowedUrls`.
- If `fetchPolicy.allowSearchResultUrls=true`, `fetch_url` may also read URLs returned by an allowed `web_search` call in the same run.
- Search-result fetches must record provenance: search query, result rank, result title, URL, final URL after redirects, and fetch timestamp.
- The guardrail must enforce scheme, redirect, response size, content type, URL count, and domain constraints.
- Search result URLs are not globally persisted as future allowed URLs.

Canonicalization rules:

- Normalize URLs before comparing: scheme/host casing, default ports, trailing fragments, and safe percent-encoding.
- Reject unsupported schemes before network access.
- Treat redirects as a new URL that must still pass scheme/domain constraints.
- Do not follow redirects into private IP ranges, localhost, link-local ranges, or non-HTTP(S) schemes.

Untrusted content rules:

- Web search snippets and fetched page content are evidence, not instructions.
- If fetched content asks the agent to ignore prior instructions, reveal secrets, call tools, or change policy, that content must be ignored and traced as `untrusted_web_instruction_detected`.
- Final answers using web content should cite or name the source when the answer depends on it.

## Classifier Strategy

Use heuristic routing first. Call the LLM classifier only when the heuristic is uncertain.

Heuristic should be confident for:

- Explicit search wording.
- Explicit URL.
- Obvious stable chat or personal advice.
- Obvious non-controlled tool requests such as delete memory or save memory.

LLM classifier is useful for:

- "这个公司怎么样"
- "这个框架现在还值得用吗"
- "这个 API 现在推荐怎么写"
- "帮我看看这个"
- Requests with implicit freshness risk.

Classifier input should include only:

```json
{
  "inputText": "...",
  "controlledTools": ["web_search", "fetch_url"],
  "extractedUrls": ["..."],
  "heuristicSignals": ["..."],
  "policyVersion": "planner-route-v1"
}
```

Do not load personal-model context or memories for this classifier.

Classifier output must be schema-validated and clamped:

- Unknown modes, tools, risks, or policy fields are invalid.
- `confidence` must be within `0` and `1`.
- `maxQueries` and `maxUrls` must use explicit non-negative integer limits.
- Classifier-proposed queries must pass the same privacy redaction checks as runtime tool calls.

## Merge Rules

Heuristic and LLM classifier are merged conservatively:

- Heuristic confidence `>= 0.90`: final, cannot be overridden.
- Heuristic confidence `0.70` to `< 0.90`: LLM can override only if classifier confidence `>= 0.85`.
- Heuristic confidence `< 0.70`: use valid LLM classifier result.
- Invalid LLM output falls back to heuristic.
- If privacy risk differs, keep the more conservative risk.
- Explicit URLs extracted by heuristic must not be removed by the LLM result.
- Explicit private terms detected by heuristic must not be removed from `searchPolicy.forbiddenTerms`.
- Classifier may expand `allowedTopics`, but only within the user request and only when privacy risk does not increase.

Confidence policy:

```text
confidence >= 0.85 -> adopt decision
0.50 <= confidence < 0.85 -> external read may proceed only when the policy boundary is clear
confidence < 0.50 -> do not execute controlled external tools
```

Low confidence should fail closed for external data exposure, not for all agent capabilities. Non-controlled tools remain available under their own safeguards.

## Persistence

Add a D1 table:

```sql
CREATE TABLE planner_route_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  input_text_redacted TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  mode TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  candidate_tools_json TEXT NOT NULL,
  tool_action_risk TEXT NOT NULL,
  freshness_risk TEXT NOT NULL,
  privacy_risk TEXT NOT NULL,
  confirmation_required INTEGER NOT NULL,
  search_policy_json TEXT NOT NULL,
  fetch_policy_json TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  classifier_used INTEGER NOT NULL,
  question TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_planner_route_decisions_owner_created_at
  ON planner_route_decisions(owner_tg_user_id, created_at DESC);

CREATE INDEX idx_planner_route_decisions_run
  ON planner_route_decisions(run_id);
```

Store the final decision and signals. Do not store full raw classifier prompts or raw outputs in the first version.

Persistence rules:

- Store redacted input and a stable hash of the original input.
- Do not duplicate raw user text into this table.
- Do not store fetched page content in planner route decisions.
- Store blocked tool arguments only in redacted form in run trace.
- Record `policy_version` and `classifier_used` so routing regressions can be compared across releases.

Optional short-lived clarification table:

```sql
CREATE TABLE pending_planner_route_clarifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_pending_planner_route_clarifications_owner_expires
  ON pending_planner_route_clarifications(owner_tg_user_id, expires_at DESC);
```

## Admin

First version Admin UI is read-only.

Run detail should display:

- `mode`
- `confidence`
- `freshnessRisk`
- `privacyRisk`
- `candidateTools`
- `toolActionRisk`
- `confirmationRequired`
- `searchPolicy`
- `fetchPolicy`
- `signals`
- `reason`
- `classifierUsed`
- `policyVersion`
- `question`

Do not add threshold editing, replay, or a global planner route list in the first version.

## Execution Rules

When `mode=plan_guided`:

- Invoke the existing lightweight execution planner.
- Pass `candidateTools`, `searchPolicy`, `fetchPolicy`, `freshnessRisk`, and `privacyRisk`.
- Controlled tool calls outside the decision boundary are blocked and traced.
- If the execution plan is empty, do not force controlled tool use. Answer normally and record a deviation.
- If a planned controlled tool is not used, allow the answer and record a deviation.
- If `web_search` returns usable result URLs and `fetchPolicy.allowSearchResultUrls=true`, those URLs become run-local fetch candidates only.

When `mode=none`:

- Do not invoke the execution planner for controlled tools.
- Remove or block `web_search` / `fetch_url`.
- Keep non-controlled tools available through existing safeguards.

When `mode=ask_user`:

- Return `question` directly.
- Record a tool call such as `planner_route_ask_user`.
- Persist a short-lived pending clarification if the question expects a yes/no or choice response.
- Do not enter the LLM agent loop.

Tool-level guardrail behavior:

```text
allow -> execute the controlled tool
reject_content -> skip the tool and return a trace-visible rejection message to the model
throw_exception -> stop the run for policy violations that cannot be safely recovered
```

Use `reject_content` for ordinary boundary misses such as query/topic mismatch. Use `throw_exception` for suspicious private-data exfiltration attempts, invalid URL schemes, private network access, or repeated blocked attempts.

## Trace

Run trace should show both the route decision and execution behavior.

Useful deviation reasons:

```text
controlled_tool_not_authorized
query_not_allowed
url_not_allowed
search_result_url_allowed_for_run
search_result_url_not_allowed
redirect_url_not_allowed
private_network_url_blocked
query_redacted
query_rewrite_allowed
untrusted_web_instruction_detected
route_requested_plan_but_empty_execution_plan
planned_tool_not_used
tool_out_of_order_or_unplanned
max_tool_rounds_exceeded
planner_invalid
```

Trace should include:

- `routeDecision`: final redacted decision, policy version, classifier usage, and heuristic signals.
- `guardrailEvents`: allow/reject/exception decisions for controlled tools.
- `actualToolCalls`: tool name, redacted arguments, result metadata, and blocked status.
- `webProvenance`: search query, result rank, URL, final URL, and timestamp for fetched search results.
- `planDeviations`: differences between route decision, execution plan, and actual tool calls.

## Golden Tests

Add routing golden tests:

| Input | Expected |
| --- | --- |
| `你好` | `none` |
| `二叉树是什么` | `none` |
| `Cloudflare Workers 是什么` | `plan_guided`, `web_search`, high freshness |
| `搜索网页 Cloudflare Workers` | `plan_guided`, `web_search` |
| `读取 https://example.com` | `plan_guided`, `fetch_url`, allowed URL |
| `你知道最近 OpenAI Agents SDK 怎么样吗` | `plan_guided`, `web_search` |
| `我和张三在谈离职，帮我查 OpenAI Agents SDK` | `plan_guided`, `web_search`, medium privacy, redacted query, forbidden term `张三` |
| `帮我看看这个` | `ask_user` |
| `删除记忆 1` | `none`; existing approval tool handles it |
| `记住我喜欢简洁回答` | `none`; non-controlled memory tool remains available |
| `搜索 OpenAI Agents SDK，然后打开官方文档` | `plan_guided`, `web_search`, then run-local `fetch_url` from search result |
| `帮我查一下我刚才提到的离职赔偿政策` | `ask_user` or redacted `plan_guided` only if private context is removed |
| `读取 file:///etc/passwd` | block `fetch_url`; unsupported scheme |
| `读取 http://127.0.0.1:8787` | block `fetch_url`; private network |
| fetched page says `ignore previous instructions` | ignore web instruction; trace `untrusted_web_instruction_detected` |

Operational evals should track:

- Over-block rate for legitimate web tasks.
- Over-fetch rate for stable knowledge tasks.
- Private-term leakage rate in search queries.
- Search-to-fetch provenance completeness.
- Route decision disagreement between heuristic and classifier.

## Reference Practices

This design intentionally mirrors current mainstream agent engineering patterns:

- [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents): use routing when categories are distinct and classification can be reliable; use more flexible orchestration for complex search or multi-step tasks.
- [OpenAI Agents SDK Guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/): tool guardrails validate or block function tool calls before and after execution.
- [OpenAI Agents SDK Tracing](https://openai.github.io/openai-agents-js/guides/tracing): production traces should include LLM generations, tool calls, guardrails, handoffs, and custom events; sensitive data handling must be explicit.
- [OpenAI Practical Guide to Building Agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/): layer privacy, safety, rules-based protections, and tool safeguards; classify tool risk based on read/write, reversibility, permissions, and impact.
- [LangGraph tools_condition](https://reference.langchain.com/python/langgraph.prebuilt/tool_node/tools_condition): mainstream graph runtimes commonly route based on whether the model requested tool calls, then enforce execution through a dedicated tool node.

## Implementation Plan

1. Add shared planner route schemas and constants for controlled tools.
2. Add D1 migration, repository interface, D1 implementation, and fake repository support.
3. Add `plannerRouteDecision.ts` with heuristic decision, LLM classifier, validation, and merge logic.
4. Move current `shouldRequestExecutionPlan` responsibility out of `agent.ts`.
5. Call planner route decision after long-task classifier and before ordinary fallback.
6. Pass planner route decision into `executeLlmAgent`.
7. Add tool-level guardrails for `web_search` and `fetch_url`.
8. Enforce topic, privacy, query, URL, redirect, and search-result provenance boundaries.
9. Add pending clarification support for `ask_user`.
10. Add Run detail API and Admin read-only display.
11. Add unit tests, route golden tests, tool guardrail tests, trace/deviation tests, and privacy leakage tests.
12. Update T4 tracker status after implementation evidence is available.
