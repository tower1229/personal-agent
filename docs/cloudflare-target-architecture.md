# Cloudflare Target Architecture

本文定义 Personal Agent 的 Cloudflare-native 目标架构。目标不是把当前 Node.js/SQLite 版本原样搬到 Cloudflare，而是重构成适合 Cloudflare Workers 免费层运行的单用户 Telegram-first Agent。

## Settled Constraints

- 只支持一个 owner 用户。
- Telegram Bot 是唯一自然语言交互入口。
- Admin 是 owner 控制台，不面向多用户 SaaS。
- Admin 使用 Telegram Login，只允许 owner 的 Telegram numeric user id 登录；`@shixiong` 只作为显示和辅助校验，不作为唯一授权依据。
- 部署目标优先兼容 Cloudflare 免费层。
- Skill 第一版是声明式 skill，支持 Admin 动态增删改查，不支持 Admin 上传任意 JS/TS 代码执行。
- Skill 分为 `chat` 和 `workflow` 两类。
- Skill 触发支持显式触发和 LLM 意图路由，优先级为显式触发高于 LLM 路由。
- 长任务使用 Cloudflare Workflows。
- 定时任务使用 Cloudflare Cron Trigger 触发统一 tick，再由 D1 中的 schedule 表决定具体任务。
- 联网能力使用搜索 API、`fetch_url` 和来源总结，不做浏览器自动化。
- RAG 使用 D1 + R2 + Vectorize。
- Admin 使用独立 React SPA，与 Worker API 同域部署。
- 仓库最终采用轻量 npm workspaces monorepo。

## Non-goals

- 不做多租户、组织权限、RBAC/ABAC。
- 不支持普通用户访问 Admin。
- 不在 Admin 中动态执行任意代码。
- 不在 Cloudflare Workers 中运行 Playwright、Chrome 或浏览器自动化。
- 不保留 Telegraf polling、Docker 单机运行和 `better-sqlite3` 作为最终主路径。
- 不把 Workflow 自带状态当作长期审计事实来源。

## Platform Mapping

| 能力 | Cloudflare 组件 | 说明 |
| --- | --- | --- |
| HTTP 入口 | Workers + Hono | Telegram webhook、Admin API、auth callback、静态资源入口 |
| Admin UI | React SPA | 同域部署在 `/admin` |
| 关系数据 | D1 | runs、tools、skills、schedules、documents metadata、eval results |
| 大文件和 artifact | R2 | 原始文档、提取文本、长报告、备份导出 |
| 向量检索 | Vectorize | 文档 chunk embedding |
| 长任务 | Workflows | skill workflow、RAG indexing、eval、联网研究 |
| 异步消息 | Queues | webhook 快速返回后投递后台处理 |
| 定时任务 | Cron Triggers | 统一 tick，扫描 D1 schedules |
| 配置和密钥 | Wrangler vars/secrets | token、provider key、owner id |

Cloudflare 免费层有明确限制：Workers Free 每天 100,000 requests、每次 invocation 50 个外部 subrequests；D1 Free 单库 500MB、账号 5GB；Workflows Free 单 step CPU 很小，完成状态保留时间有限。因此系统设计必须保持 step 轻量、查询分页、长期状态落 D1/R2。

参考：

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/get-started/intro/)
- [Telegram Login](https://core.telegram.org/bots/telegram-login)

## Runtime Topology

```text
Telegram Webhook
  -> Cloudflare Worker
    -> owner allowlist
    -> run creation
    -> approval router
    -> skill router
    -> agent runtime
    -> tool registry
    -> D1 / R2 / Vectorize
    -> Queues / Workflows
    -> Telegram Bot HTTP API

Admin React SPA
  -> /api/admin/*
    -> Telegram session cookie
    -> owner-only Admin API
    -> Skills / Runs / Workflows / RAG / Search / Eval / Schedules

Cron Trigger
  -> scheduled handler
    -> scan due schedules in D1
    -> start Workflow or enqueue task
```

Recommended public routes:

```text
/admin
/api/admin/*
/auth/telegram/callback
/telegram/webhook
```

The Worker should serve the Admin SPA and APIs from the same origin to simplify cookies, CORS, Telegram allowed URLs and CSRF protection.

## Authentication And Owner Gate

Admin authentication uses Telegram Login:

1. Admin SPA shows Telegram Login.
2. Telegram redirects to `/auth/telegram/callback`.
3. Worker verifies the Telegram login hash using the bot token.
4. Worker checks `id === OWNER_TG_USER_ID`.
5. Worker sets a signed, HttpOnly, SameSite cookie.
6. SPA calls `/api/admin/me` to load session state.

Telegram webhook authentication uses `X-Telegram-Bot-Api-Secret-Token`.

Owner checks apply to both Admin and Telegram messages:

- Admin allows only `OWNER_TG_USER_ID`.
- Telegram messages from other users are ignored or rejected with a minimal response.
- Username changes do not affect authorization.

Destructive operations still require confirmation. This is not for multi-user security; it is for owner mistake prevention and traceability.

## Telegram Integration

The final Cloudflare version should not use Telegraf. It should use a lightweight Telegram Bot HTTP API wrapper around `fetch`.

Minimum client operations:

- `sendMessage`
- `editMessageText`
- `answerCallbackQuery`
- `getFile`
- `downloadFile`

Webhook handling:

```text
POST /telegram/webhook
  -> verify secret token
  -> parse update
  -> reject non-owner
  -> create run
  -> route approval / command / skill / agent
  -> enqueue or execute lightweight task
```

## Skill Model

Skill is a first-class Admin-managed resource. First version is declarative and versioned.

Core concepts:

```text
skill
  stable identity
  lifecycle metadata
  enabled / deleted flags

skill_version
  immutable executable definition
  created when a draft is published
  referenced by every skill run
```

Skill fields:

```text
id
name
description
kind: chat | workflow
enabled
triggerPhrases
intentExamples
instructions
allowedTools
riskLevel
autoRunThreshold
confirmThreshold
workflowTemplate
schedule
evalCases
```

Versioning rule:

- Draft skill can be edited.
- Published skill version is immutable.
- Every run points to the exact skill version used.
- Deleting a skill is soft delete so historical runs remain debuggable.

## Skill Routing

Routing order:

1. Explicit exact trigger, such as `/skill xxx` or configured phrase.
2. Explicit prefix trigger, such as `用周报 skill ...`.
3. LLM intent router over enabled skills.
4. Fallback to ordinary Agent.

LLM router output:

```text
matchedSkillId | null
confidence
reason
```

Recommended thresholds:

- `confidence >= autoRunThreshold`: run automatically.
- `confirmThreshold <= confidence < autoRunThreshold`: ask owner to confirm.
- `< confirmThreshold`: fallback to ordinary Agent.

Every routing decision should be persisted for debugging.

## Chat Skill Execution

Chat skill is a scoped agent conversation.

```text
message
  -> matched skill version
  -> build skill-scoped system prompt
  -> expose only allowedTools
  -> execute agent loop
  -> persist run, route decision and tool calls
  -> reply in Telegram
```

The tool registry must support per-run tool allowlists. A skill cannot call tools outside its published allowed tool list.

## Workflow Skill Execution

Workflow skill is a long-running, step-based task.

```text
message / schedule / admin manual run
  -> create skill_run in D1
  -> start Cloudflare Workflow
  -> execute steps
  -> persist each step to D1
  -> write large outputs to R2 artifacts
  -> send short result to Telegram
  -> show full trace in Admin
```

First-version step types:

- `llm`
- `tool`
- `web_search`
- `fetch_url`
- `rag_search`
- `wait`
- `approval`
- `condition`
- `send_telegram`
- `save_artifact`

Workflow state should not store large reports or permanent history. D1 and R2 are the durable record.

## Admin SPA

Admin is a React SPA, not server-rendered HTML.

Recommended stack:

- React
- Vite
- TypeScript
- TanStack Router
- TanStack Query
- React Hook Form
- Zod

Admin capabilities:

- Login and session state.
- Skill CRUD and publish.
- Chat skill test run.
- Workflow skill editor.
- Schedule management.
- Skill run trace.
- Run/tool/approval trace.
- RAG document and debug views.
- Web search provider and test query.
- Eval run dashboard.
- Backup/export entry points.

Admin API should expose typed DTOs from `packages/shared` schemas. The SPA must not access secrets directly.

## Data Model

Existing concepts to preserve:

- `runs`
- `tool_calls`
- `approval_requests`
- `todos`
- `memories`
- `memory_events`
- `documents`
- `document_chunks`
- `eval_runs`
- `eval_results`

New Cloudflare target concepts:

- `skills`
- `skill_versions`
- `skill_route_decisions`
- `skill_runs`
- `skill_run_steps`
- `artifacts`
- `schedules`
- `web_search_runs`
- `web_search_results`
- `rag_queries`
- `rag_query_results`

The old `jobs` table should not remain the execution queue. Cloudflare Queues and Workflows provide execution mechanics; D1 tables record business state and trace.

## RAG Architecture

Storage split:

```text
D1
  documents
  document_chunks
  rag_queries
  rag_query_results

R2
  raw documents
  extracted text
  large artifacts
  backup exports

Vectorize
  chunk embeddings
  metadata: ownerId, documentId, chunkId, sourceType
```

Indexing:

```text
upload/import document
  -> save raw content to R2
  -> create document row in D1
  -> start Workflow
  -> extract text
  -> chunk
  -> embed in batches
  -> upsert vectors
  -> mark indexed
```

Retrieval:

```text
query
  -> create query embedding
  -> Vectorize topK with metadata filter
  -> load chunk content from D1/R2
  -> merge with keyword fallback
  -> rerank
  -> return cited chunks
```

Chunk content should not be stored as long Vectorize metadata. Metadata should stay short and filterable.

## Web Search

First-version online search is API-based.

Tools:

- `web_search`
- `fetch_url`
- `summarize_sources`

Provider should be behind an interface:

```text
SearchProvider.search(query, maxResults, freshness)
```

Admin controls:

- provider selection
- provider key configured status
- enabled flag
- daily call budget
- max results per call
- allow/deny domain lists
- test query
- search trace and citations

Security boundaries:

- only GET for `fetch_url`
- response size limit
- content-type allowlist
- block localhost, private IP ranges and metadata IPs
- treat fetched pages as untrusted context
- answers must include URL citations

## Scheduling

Cloudflare account cron triggers are limited, so the system should use one coarse Cron Trigger as a scheduler tick.

```text
scheduled handler
  -> query enabled schedules with nextRunAt <= now
  -> atomically reserve due schedules
  -> start skill workflow or enqueue task
  -> compute nextRunAt
  -> persist schedule history
```

Schedule records should include:

- owner id
- skill id
- skill version id or latest published flag
- timezone
- rule
- enabled
- next run time
- last run time
- failure count

## Observability

Trace remains a core learning and operational feature.

Persist:

- route decisions
- runs
- tool calls
- approval lifecycle
- skill runs
- workflow steps
- web search results
- RAG query results
- eval scoring
- token and cost metadata where provider supplies it

Admin should show concise timelines first, with expandable raw JSON for debugging.

## Repository Layout

Final repository layout:

```text
apps/
  worker/
    src/
    wrangler.toml
    package.json

  admin/
    src/
    index.html
    vite.config.ts
    package.json

packages/
  shared/
    src/
      schemas/
      types/
    package.json

docs/
eval/
package.json
tsconfig.base.json
```

Use npm workspaces. Do not introduce Nx or Turborepo initially.

Dependency direction:

```text
apps/worker -> packages/shared
apps/admin  -> packages/shared
packages/shared -> no app imports
```

## Final Cleanup Rule

Temporary dual-runtime code is allowed during migration. The final architecture must not keep historical Node/SQLite/Docker paths as supported runtime options.

Final repo should not contain production paths for:

- Telegraf polling
- `better-sqlite3`
- local SQLite job worker
- Docker deployment
- server-rendered Admin UI
- `.env`-driven local production runtime as primary deployment path

