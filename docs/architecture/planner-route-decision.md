# Planner Route Decision

## Goal

Make the decision to use the lightweight planner explicit, stable, auditable, and privacy-aware for ordinary LLM fallback requests.

The route decision controls tools with clear routing value: `web_search` and `fetch_url`. Other tools stay available through the existing agent/tool safety model so agent capability is not reduced unnecessarily.

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
- Do not add Telegram inline callback or long-lived pending state for planner clarification unless the user explicitly asks for that interaction model.
- Do not lose short confirmation replies such as `是` or `确认`; use a short-lived pending clarification record for the next owner message.
- Do not store full raw classifier prompts or outputs in D1.
- Do not let `fetch_url` browse arbitrary URLs outside explicit user URLs or URLs returned by an allowed `web_search` call in the same run.
- Do not treat search results or fetched webpages as trusted instructions.

## Routing Position

Planner route decision runs only after the existing routes have declined without taking over the current run:

```text
built-in command
  -> semantic skill routing
  -> long-task complexity classifier
  -> planner route decision
  -> ordinary LLM fallback / plan-guided fallback
```

Long task remains the stronger execution mode. Planner routing only decides whether a short ordinary fallback request should enable plan-guided use of controlled external tools.

If a prior route takes over the run by executing, asking for confirmation, rejecting, or waiting for user input, planner route decision does not run. This avoids multiple clarification flows for one owner message.

## Controlled Tools

Controlled tools:

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

`delete_memory_request` continues to rely on the existing approval mechanism. Internal personal-model tools are not routed by planner route decision.

## Decision Shape

```ts
type PlannerRouteMode = "none" | "plan_guided" | "ask_user";
type ControlledToolName = "web_search" | "fetch_url";
type PlannerRouteDecisionSource =
  | "heuristic_final"
  | "heuristic_with_classifier_agree"
  | "classifier_override"
  | "classifier_fallback_invalid"
  | "classifier_low_confidence_fallback";

interface PlannerRouteDecision {
  policyVersion: string;
  mode: PlannerRouteMode;
  confidence: number;
  reason: string;
  candidateTools: ControlledToolName[];
  externalToolRisk: "none" | "external_read";
  freshnessRisk: "low" | "medium" | "high";
  privacyRisk: "low" | "medium" | "high";
  confirmationRequired: boolean;
  searchPolicy: {
    allowedTopics: string[];
    suggestedQueries: string[];
    forbiddenTerms: string[];
    redactionRequired: boolean;
    maxQueries: number; // default 2
  };
  fetchPolicy: {
    explicitAllowedUrls: string[];
    allowSearchResultUrls: boolean;
    allowedDomains: string[];
    maxUrls: number; // default 3
  };
  signals: string[];
  classifierUsed: boolean;
  decisionSource: PlannerRouteDecisionSource;
  question?: string;
}
```

`candidateTools` contains only controlled tools. It is not a full list of tools available to the agent.

Planner route decision does not replace general execution planning for non-controlled tools. If the product keeps lightweight planning for todo, memory, approval, or personal-model tools, that behavior remains a separate ordinary execution-planning concern and must not be interpreted as planner route authorization.

`externalToolRisk` describes the controlled external-tool interaction category. `external_read` means the tool is read-only with respect to remote state, but the request can still send query text, URLs, headers, and metadata externally. Data exposure sensitivity is tracked separately via `privacyRisk`, `searchPolicy.forbiddenTerms`, and `searchPolicy.redactionRequired`.

`policyVersion` must change whenever thresholds, merge behavior, query policy, URL policy, or classifier prompts materially change.

Bump `policyVersion` for changes that can alter route decisions, guardrail decisions, or persisted interpretation semantics: heuristic freshness/privacy rules, merge thresholds, classifier prompt/schema, query redaction or topic containment, URL canonicalization/provenance/private-network policy, mode semantics, or controlled tool set. Do not bump for Admin field ordering, documentation typos, test names, display-only formatting, or error-message wording that does not affect guardrail decisions.

`classifierUsed` records whether the classifier was called. `decisionSource` records how the final decision was selected after merge so route regressions can distinguish heuristic behavior from classifier behavior.

`decisionSource` describes the source of the final mode and controlled-tool selection. Conservative risk merging does not change `decisionSource`; record risk escalation in `signals`, for example `privacy_risk_escalated_by_heuristic` or `privacy_risk_escalated_by_classifier`.

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

To avoid losing context on short replies such as `是` or `确认`, the system should persist a short-lived pending route clarification for the next owner message:

```ts
interface PendingPlannerRouteClarification {
  id: string;
  sourceRunId: string;
  ownerTgUserId: number;
  question: string;
  options: ("allow_web" | "no_web" | "provide_url" | "clarify_target")[];
  confirmationScope: {
    allowedExternalExposure: string[];
    forbiddenTerms: string[];
  };
  expiresAt: number;
}
```

This design does not add Telegram inline callbacks or long-lived pending state. It uses short-lived D1 pending clarification records for the next owner message. Use a 10-minute TTL. If the pending clarification is expired or the next message is unrelated, mark it ignored, clear it, and route the new message normally.

A short confirmation such as `是`, `确认`, or `可以` authorizes only the external-read choice described in the clarification question. It does not authorize sending the full raw user text or automatically remove `searchPolicy.forbiddenTerms`. To send a sensitive term externally, the clarification question must name that term or category explicitly, and only that named term or category may be released.

If multiple pending flows exist, consume skill confirmations and approval requests before planner route clarifications. Planner clarification is lower priority and should expire or be ignored rather than stealing a reply intended for a higher-priority pending action.

Pending clarification is resolved against the original request, not against the short confirmation text. When the next owner message consumes a planner clarification:

1. Create a normal run for the new owner message.
2. Load `sourceRunId` and its original `messageText`.
3. Interpret the new message only as a clarification response.
4. Delete the pending record before executing the resumed request.
5. Re-run planner route decision for the original `messageText` with a `clarificationResponse` signal.
6. Use the new run as the execution/audit run; keep `sourceRunId` in trace for provenance.

If the response means `no_web`, force controlled external tools off and answer the original request without `web_search` or `fetch_url`. If it means `allow_web`, allow only the exposure described by `confirmationScope`. If it provides a URL, treat that URL as a new explicit user URL for the resumed request. If it is unrelated, clear the pending record and route the new message normally.

## Freshness And Privacy

Automatic web use is allowed when the agent judges external information is needed. The decision should not require the user to explicitly say "search".

Use `freshnessRisk` to decide whether current external information is likely needed:

- `high`: explicit search or web wording; recent/latest/current wording; policies, prices, schedules, news, current recommendations, availability, version-specific API guidance, or anything likely to drift.
- `medium`: facts that may drift but are not obviously time-sensitive.
- `low`: stable concepts, math, general reasoning, personal advice, local conversation context, or broad "what is X" explanations that do not ask for current details.

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
- If `privacyRisk=medium` and the redacted query still has a clear public topic, automatic `plan_guided` search is allowed.
- If redaction removes the actual target or leaves only an overly broad query, return `ask_user` instead of searching.
- For `privacyRisk=high`, do not call controlled external tools unless the user explicitly approves the data exposure in the clarification response.
- User approval is scoped to the exact exposure described by the clarification question. Generic approval still requires redaction and forbidden-term enforcement.
- The classifier and execution planner are internal routing components for the private assistant. They may use the current user input and minimal local context needed for routing.
- Internal routing output must not authorize sending private memories, profile data, or raw local context to controlled external tools.
- Persist redacted routing data by default; keep raw user text in the existing run record only if that is already part of the run storage model.

## Internal Routing Context

This is a private assistant, so internal routing should use enough personal context to understand the request well. The privacy boundary is external tool invocation, not internal classification. The routing problem is therefore not "minimize context"; it is "select the right context, explain why it was selected, and prevent selected private context from leaking into external tools."

Use a routing context builder before heuristic/classifier merge:

```ts
interface PlannerRoutingContext {
  currentInput: string;
  pendingSourceInput?: string;
  recentConversation?: Array<{
    runId: string;
    messageText: string;
    responseSummary?: string;
    createdAt: number;
  }>;
  userProfile?: {
    stableFacts: string[];
    preferences: string[];
    constraints: string[];
  };
  retrievedMemory?: Array<{
    id: string;
    summary: string;
    relevance: number;
    reason: string;
    sensitivity: "low" | "medium" | "high";
  }>;
  retrievedPersonalModel?: Array<{
    claimId?: string;
    sourceId?: string;
    summary: string;
    relevance: number;
    reason: string;
    sensitivity: "low" | "medium" | "high";
  }>;
  referenceHints: string[];
  explicitUrls: string[];
  candidatePrivateTerms: string[];
  selectedContextSummary: string;
  selectionTrace: Array<{
    source: "current_input" | "pending_source" | "recent_conversation" | "profile" | "memory" | "personal_model";
    id?: string;
    reason: string;
    sensitivity: "low" | "medium" | "high";
    includedInClassifier: boolean;
    allowedForExternalQuery: false;
  }>;
}
```

Selector rules:

- Always include the current input.
- If resolving a pending clarification, include the source run input.
- Include recent conversation when the user uses reference language such as `刚才`, `之前`, `上面`, `这个`, `继续`, or when the current request is too underspecified without conversation context.
- Retrieve relevant memory and personal-model context when it can change routing, privacy assessment, query redaction, clarification wording, or whether current external information is needed.
- Include stable profile facts, preferences, and constraints when they affect interpretation or safety. Examples: preferred language, known project names, recurring domains, source preferences, or privacy preferences.
- Rank candidate context by relevance to the current routing decision, recency, source reliability, and sensitivity. High-sensitivity context can be used internally when needed, but it must increase `privacyRisk` and populate `candidatePrivateTerms`.
- Summarize retrieved context before sending it to the classifier. The classifier receives summaries and traceable reasons, with raw excerpts included only when a summary would lose routing-critical detail.
- Preserve enough detail to resolve references and privacy boundaries. Do not impose an arbitrary small token cap that would make the assistant ignore important known context.
- Extract `referenceHints`, `explicitUrls`, and `candidatePrivateTerms` from all selected context.
- Treat selected local context as internal evidence only. It can decide `freshnessRisk`, `privacyRisk`, `allowedTopics`, forbidden terms, and clarification questions, but it is not approved search query material.
- Persist the routing context trace in redacted/summarized form so Admin can explain why the assistant considered a memory, profile fact, or prior conversation relevant.

The ordinary answer agent may use the full answer-oriented personal-model context assembly. Planner route classification uses a routing-oriented context builder: it may retrieve from the same underlying personal model, but it must optimize for routing, privacy, and external-tool policy rather than answer generation.

## Queries And URLs

The route decision constrains what can be sent externally.

For `web_search`:

- `suggestedQueries` are preferred queries, not exact string allowlists.
- Default `maxQueries` is 2 unless the decision narrows it further. It counts attempted `web_search` calls, not unique query strings; repeated searches still count.
- `web_search` returns up to 10 results per allowed search call.
- `allowedTopics` must contain short canonical public topics. Guardrails compare candidate queries against topic containment, not raw string equality or loose semantic similarity.
- A query may be rewritten if it stays within `searchPolicy.allowedTopics`, avoids `searchPolicy.forbiddenTerms`, and respects redaction.
- The tool guardrail should block a query when it contains forbidden private terms, broadens the topic beyond the user request, exceeds `maxQueries`, or conflicts with `privacyRisk`.
- Topic containment should use conservative token/entity checks plus classifier validation when needed: the query must preserve the core public entity or topic, must not introduce unrelated entities, and must not add private context.
- Redacted queries must remain specific enough to answer the user request. If no bounded public query can be constructed, prefer `ask_user`.
- If the system cannot construct a bounded redacted query, prefer `ask_user` or `none` rather than unbounded search.

For `fetch_url`:

- `fetch_url.url` may exactly match `fetchPolicy.explicitAllowedUrls`.
- Default `maxUrls` is 3 unless the decision narrows it further. It counts attempted `fetch_url` calls, not unique URLs; repeated fetches of the same URL still count.
- Explicit user-provided URLs are treated as intentionally provided fetch targets and do not require privacy scanning of the URL text. URL security guardrails still apply.
- If `fetchPolicy.allowSearchResultUrls=true`, `fetch_url` may also read URLs returned by an allowed `web_search` call in the same run.
- URLs invented by the LLM, URLs from previous runs, URLs from memory, and URLs from unrelated context are not automatically allowed.
- `fetchPolicy.allowedDomains=[]` means no additional domain restriction. It does not remove URL provenance, scheme, redirect, private-network, size, content-type, or URL-count guardrails.
- Non-empty `fetchPolicy.allowedDomains` is a narrowing constraint, for example when the user asks to use only official domains.
- When the user asks for an official source or official documentation, narrow `allowedDomains` to clearly identified official domains. If the official domain cannot be identified confidently, search may still run, but fetch should be skipped or the user should be asked to choose a source.
- User-provided source constraints override explicit URLs. If the user both provides a URL and says to use only a different official or allowed domain, return `ask_user` or block with `domain_not_allowed`.
- Classifier-generated `allowedDomains` must not block an explicit user-provided URL unless the user expressed a source constraint.
- Only the top 5 results from an allowed `web_search` call become run-local fetch candidates. Actual `fetch_url` attempts are still limited by `maxUrls`.
- Search-result fetches must record provenance: search query, result rank, result title, URL, final URL after redirects, and fetch timestamp.
- The guardrail must enforce scheme, redirect, response size, content type, URL count, and domain constraints.
- Allowed content types are `text/html`, `text/plain`, and `application/json`. Block other content types. If content type is missing, read only a small prefix to sniff text; allow only likely text content.
- Search result URLs are not globally persisted as future allowed URLs.

Canonicalization rules:

- Normalize URLs before comparing: scheme/host casing, default ports, trailing fragments, and safe percent-encoding.
- Reject unsupported schemes before network access.
- Treat redirects as a new URL that must still pass scheme, domain, and private-network constraints before any redirected fetch is allowed.
- Private network, localhost, and link-local URLs are blocked even when the user provides them explicitly. Local development or desktop-local browsing needs a separate connector and permission boundary, not the Cloudflare Worker `fetch_url` tool.

URL guardrail:

- Allow only URLs from `fetchPolicy.explicitAllowedUrls` or the top 5 results of an allowed same-run `web_search`.
- Allow only `http` and `https`.
- Block localhost/private/link-local targets before network access: `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `[::1]`, IPv6 local/link-local literals, and private-network hostnames detected by DNS resolution.
- Resolve hostnames before fetch and block private, loopback, link-local, multicast, and otherwise non-public IP results.
- Follow redirects only manually and one hop at a time. Every redirect target must pass the same canonicalization, provenance, domain, DNS, private-network, scheme, count, and content guardrails before the next request.
- Enforce a redirect hop limit.
- Enforce `maxUrls`, response byte limit, and the content-type allowlist.
- Record blocked reason, canonical input URL, redirect chain, final URL, and fetch timestamp.

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

Classifier input should include the current user input, controlled tool metadata, extracted URLs, routing signals, and the selected `PlannerRoutingContext`. The routing context is for classification and reference resolution only, not as material for external queries.

```json
{
  "inputText": "...",
  "controlledTools": ["web_search", "fetch_url"],
  "extractedUrls": ["..."],
  "routingContext": {
    "pendingSourceInput": "...",
    "referenceHints": ["..."],
    "candidatePrivateTerms": ["..."]
  },
  "heuristicSignals": ["..."],
  "policyVersion": "planner-route-v1"
}
```

Do not treat classifier-visible local context as approved external query material. Search and fetch guardrails must still enforce redaction, forbidden terms, URL provenance, and explicit exposure approval.

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
- If conservative risk merging changes `privacyRisk`, keep `decisionSource` based on mode/tool selection and add a risk-escalation signal.

Confidence policy:

```text
confidence >= 0.85 -> adopt decision
0.50 <= confidence < 0.85 -> external read may proceed only when the policy boundary is clear
confidence < 0.50 -> do not execute controlled external tools
```

Low confidence should fail closed for external data exposure, not for all agent capabilities. Non-controlled tools remain available under their own safeguards.

Explicit search or web wording increases tool-intent and freshness confidence, but it does not override high privacy risk. If the request cannot be reduced to a bounded public query without exposing sensitive content, return `ask_user`.

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
  external_tool_risk TEXT NOT NULL,
  freshness_risk TEXT NOT NULL,
  privacy_risk TEXT NOT NULL,
  confirmation_required INTEGER NOT NULL,
  search_policy_json TEXT NOT NULL,
  fetch_policy_json TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  classifier_used INTEGER NOT NULL,
  decision_source TEXT NOT NULL,
  question TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_planner_route_decisions_owner_created_at
  ON planner_route_decisions(owner_tg_user_id, created_at DESC);

CREATE INDEX idx_planner_route_decisions_run
  ON planner_route_decisions(run_id);
```

Store every planner route decision after this layer runs, including `none`, `plan_guided`, and `ask_user`. Requests handled by built-in commands, explicit or semantic skills, or long tasks do not create planner route decisions because this layer did not run. Store the final decision and signals. Do not store full raw classifier prompts or raw outputs in planner route decision tables.

Persistence rules:

- Store redacted input and a stable hash of the original input.
- Do not duplicate raw user text into this table.
- Explicit user-provided URLs may be stored in full in `fetchPolicy.explicitAllowedUrls` and trace records.
- Search result URLs, redirect chains, and final URLs may be stored in full in `webProvenance`.
- Do not store fetched page content in planner route decisions.
- Store blocked tool arguments only in redacted form in run trace.
- Record `policy_version`, `classifier_used`, and `decision_source` so routing regressions can be compared across releases.

Optional short-lived clarification table:

```sql
CREATE TABLE pending_planner_route_clarifications (
  id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  confirmation_scope_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_pending_planner_route_clarifications_owner_expires
  ON pending_planner_route_clarifications(owner_tg_user_id, expires_at DESC);
```

The pending clarification table stores only active records. Delete a record after it is consumed, ignored, or expired; historical evidence belongs in run trace events, not in the pending table.

## Admin

Admin UI is read-only for planner route decisions unless the user explicitly asks for policy editing or replay controls.

Run detail should display planner route decision in a separate section from skill route decision. Skill route decision explains whether a standard skill was selected. Planner route decision explains whether ordinary fallback was allowed to use controlled external tools.

Planner Route Decision should display:

- `mode`
- `confidence`
- `freshnessRisk`
- `privacyRisk`
- `candidateTools`
- `externalToolRisk`
- `confirmationRequired`
- `searchPolicy`
- `fetchPolicy`
- `signals`
- `reason`
- `classifierUsed`
- `decisionSource`
- `policyVersion`
- `question`

Do not add threshold editing, replay, or a global planner route list unless the user explicitly asks for those Admin controls.

## Execution Rules

When `mode=plan_guided`:

- Invoke the existing lightweight execution planner.
- Pass `candidateTools`, `searchPolicy`, `fetchPolicy`, `freshnessRisk`, and `privacyRisk`.
- Controlled tool calls outside the decision boundary are blocked and traced.
- Controlled planning filters only `web_search` and `fetch_url`. It must not narrow the allowlist for non-controlled tools.
- The effective tool allowlist is: all non-controlled tools allowed by the existing agent/tool safety model, plus the planned controlled tools that pass route and guardrail checks.
- If the execution plan is empty, do not force controlled tool use. Answer without controlled tools and record a deviation.
- If the LLM attempts `web_search` or `fetch_url` after an empty controlled-tool plan, block the call and trace it as a deviation.
- If a planned controlled tool is not used, allow the answer and record a deviation.
- If `web_search` returns usable result URLs and `fetchPolicy.allowSearchResultUrls=true`, those URLs become run-local fetch candidates only.
- Controlled tool order is enforced. A `fetch_url` that uses a search result URL must occur after the allowed `web_search` call that produced that URL.
- A `fetch_url` for an explicit user-provided URL may run without a prior `web_search` if the URL is in `fetchPolicy.explicitAllowedUrls`.
- Controlled tool calls that are out of order or not in the controlled-tool plan are blocked and traced as `tool_out_of_order_or_unplanned`.

When `mode=none`:

- Do not invoke the execution planner for controlled tools.
- Remove or block `web_search` / `fetch_url`.
- Keep non-controlled tools available through existing safeguards.

When `mode=ask_user`:

- Return `question` directly.
- Record a route trace event such as `planner_route_ask_user`; do not record it as a real tool call.
- Persist a short-lived pending clarification if the question expects a yes/no or choice response.
- Do not enter the LLM agent loop.

Tool-level guardrail behavior:

```text
allow -> execute the controlled tool
reject_content -> skip the tool and return a synthetic blocked tool result to the model
throw_exception -> stop the run for policy violations that cannot be safely recovered
```

Use `reject_content` for ordinary boundary misses such as query/topic mismatch. Use `throw_exception` for suspicious private-data exfiltration attempts, invalid URL schemes, private network access, or repeated blocked attempts.

Guardrail recovery behavior:

- For the first ordinary controlled-tool boundary miss in a run, append one synthetic tool result such as `{ "blocked": true, "reason": "query_not_allowed" }` and allow one more LLM completion.
- If the model repeats the same controlled-tool violation after that synthetic result, stop the run with `throw_exception`.
- High-risk violations such as unsupported schemes, private network access, or suspicious private-data exfiltration use `throw_exception` on the first occurrence.
- Record all blocked attempts in `guardrailEvents` and `actualToolCalls`; only real tool executions should produce external tool side effects.

## Trace

Run trace should show both the route decision and execution behavior.

Useful deviation reasons:

```text
controlled_tool_not_authorized
query_not_allowed
url_not_allowed
unsupported_scheme
domain_not_allowed
content_type_not_allowed
response_size_exceeded
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

- `routeDecision`: final redacted decision, policy version, classifier usage, decision source, and heuristic signals.
- `guardrailEvents`: allow/reject/exception decisions for controlled tools.
- `actualToolCalls`: tool name, redacted arguments, result metadata, and blocked status.
- `webProvenance`: search query, result rank, URL, redirect chain, final URL, and timestamp for fetched search results.
- `planDeviations`: differences between route decision, execution plan, and actual tool calls.

## Golden Tests

Add routing golden tests:

| Input | Expected |
| --- | --- |
| `你好` | `none` |
| `二叉树是什么` | `none` |
| `Cloudflare Workers 是什么` | `none`; broad stable explanation |
| `Cloudflare Workers 现在怎么部署` | `plan_guided`, `web_search`, high freshness |
| `搜索网页 Cloudflare Workers` | `plan_guided`, `web_search` |
| `读取 https://example.com` | `plan_guided`, `fetch_url`, allowed URL |
| `你知道最近 OpenAI Agents SDK 怎么样吗` | `plan_guided`, `web_search` |
| `我和张三在谈离职，帮我查 OpenAI Agents SDK` | `plan_guided`, `web_search`, medium privacy, redacted query, forbidden term `张三` |
| `帮我看看这个` | `ask_user` |
| `删除记忆 1` | `none`; existing approval tool handles it |
| `记住我喜欢简洁回答` | `none`; non-controlled memory tool remains available |
| `搜索 OpenAI Agents SDK，然后打开官方文档` | `plan_guided`, `web_search`, then run-local `fetch_url` from search result |
| `帮我查一下我刚才提到的离职赔偿政策` | `ask_user` or redacted `plan_guided` only if private context is removed |
| `读取 file:///etc/passwd` | `plan_guided`, `fetch_url`, no allowed URL; guardrail `unsupported_scheme` |
| `读取 http://127.0.0.1:8787` | `plan_guided`, `fetch_url`, no allowed URL; guardrail `private_network_url_blocked` |
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
4. Move the controlled-tool part of current `shouldRequestExecutionPlan` responsibility out of `agent.ts`; non-controlled tool planning, if retained, stays separate from planner route decision.
5. Call planner route decision after long-task classifier and before ordinary fallback.
6. Pass planner route decision into `executeLlmAgent`.
7. Add tool-level guardrails for `web_search` and `fetch_url`.
8. Enforce topic, privacy, query, URL, redirect, and search-result provenance boundaries.
9. Add pending clarification support for `ask_user`.
10. Add Run detail API and Admin read-only display.
11. Add unit tests, route golden tests, tool guardrail tests, trace/deviation tests, and privacy leakage tests.
12. After implementation and verification are complete, update T4 tracker status with concrete evidence. Do not update tracker status during the design-only phase.
