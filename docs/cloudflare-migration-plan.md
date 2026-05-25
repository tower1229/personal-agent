> ??????????????????????? Node.js/SQLite/Docker/Telegraf ???????????????

# Cloudflare Migration Plan

本文定义从当前 Node.js/SQLite 版本迁移到 Cloudflare-native 版本的执行计划。迁移允许阶段性双运行时并存，但最终必须清理历史冗余，只保留 Cloudflare 目标架构。

## Migration Principles

- 分阶段迁移，避免一次性打碎当前可运行系统。
- 每个阶段都有退出标准。
- 临时兼容层必须有明确删除阶段。
- 新功能优先落到 Cloudflare 目标路径，不继续扩大旧 Node 路径。
- Admin、skill、workflow、RAG、search 的新设计以 `docs/cloudflare-target-architecture.md` 为准。
- 文档和 README 在最终清理阶段只描述 Cloudflare 架构，不保留旧范围、旧原型和旧部署假设。

## Phase 0: Architecture Baseline

目标：固定目标架构和迁移边界。

交付物：

- `docs/cloudflare-target-architecture.md`
- `docs/cloudflare-migration-plan.md`

退出标准：

- 单用户、Telegram-first、Cloudflare 免费层、Admin React SPA、声明式 skill、Workflows、D1/R2/Vectorize 等约束已记录。
- 明确非目标：多用户 RBAC、动态代码 skill、浏览器自动化、Telegraf polling、Docker 主路径。

## Phase 1: Monorepo And Shared Schemas

目标：建立最终仓库形态，但保留旧 `src/` 临时可运行。

新增结构：

```text
apps/
  worker/
  admin/
packages/
  shared/
```

主要任务：

- 配置 npm workspaces。
- 新增 `tsconfig.base.json`。
- 建立 `packages/shared`。
- 将 skill manifest、workflow step、Admin DTO、eval case 的 Zod schema 放入 shared。
- Worker 和 Admin 只通过 shared 共享类型。

退出标准：

- 根目录 `npm install` 可安装所有 workspace。
- `npm run typecheck` 或等价命令可覆盖 shared。
- `packages/shared` 不 import app 代码。
- 旧 Node 版本仍可运行，作为迁移期间的参考实现。

## Phase 2: Cloudflare Worker Skeleton

目标：建立 Cloudflare 运行时骨架。

主要任务：

- 创建 `apps/worker/wrangler.toml`。
- 使用 Hono 建立 Worker handler。
- 增加 `/telegram/webhook`。
- 增加 `/api/admin/health`。
- 增加 `/auth/telegram/callback`。
- 增加 Admin SPA 静态资源服务入口。
- 接入 Wrangler secrets/vars。
- 增加 webhook secret 校验。
- 增加 owner Telegram numeric id allowlist。

退出标准：

- `wrangler dev` 可启动 Worker。
- `/api/admin/health` 返回健康状态。
- `/telegram/webhook` 能处理测试 update 或拒绝非法 secret。
- 非 owner Telegram update 被拒绝或忽略。
- Admin SPA 可以从 `/admin` 打开。

## Phase 3: Admin React SPA

目标：替代 server-rendered Admin UI 的目标路径。

主要任务：

- 创建 `apps/admin` Vite React SPA。
- 实现 Telegram Login 页面。
- 实现 `/api/admin/me` session 检查。
- 实现基础布局和导航。
- 实现 Skills、Runs、Schedules、RAG、Search、Evals 的页面骨架。
- 建立 API client 和 shared schema 校验。

退出标准：

- Admin 登录成功后可进入控制台。
- 未登录访问 Admin API 返回 401。
- API 不接受 query token 作为登录方式。
- SPA 与 API 同域工作，不需要 CORS。

## Phase 4: D1 Repository Layer

目标：替换 `better-sqlite3` 数据访问路径。

主要任务：

- 设计 D1 migrations。
- 建立 repository 接口：
  - runs
  - tool calls
  - approvals
  - todos
  - memories
  - skills
  - schedules
  - documents
  - evals
- 实现 D1 repository。
- 为关键查询增加索引。
- 控制 Admin 列表页分页和 trace 查询数量。

退出标准：

- Worker 业务层不直接依赖 D1 raw binding。
- 新代码不 import `better-sqlite3`。
- D1 schema 能创建完整目标表。
- 基础 repository 单元测试或集成测试通过。

## Phase 5: Telegram Core Feature Migration

目标：让 Cloudflare 版 Telegram 基础 agent 可用。

迁移顺序：

1. runs 和 tool calls。
2. todos。
3. memories。
4. approvals。
5. ordinary chat agent。

主要任务：

- 用 Telegram Bot HTTP API 封装替换 Telegraf。
- 实现 text message webhook。
- 实现 create/list/complete todo tools。
- 实现 save/search/delete memory tools。
- 实现 approval request 和确认码。
- 实现 tool allowlist runtime。

退出标准：

- owner 可通过 Telegram 创建、查询、完成 todo。
- owner 可保存、查询、删除 memory。
- destructive memory delete 必须创建 approval。
- approval 确认码流程跑通。
- tool_calls 和 runs 可在 Admin 查看。

## Phase 6: Skill System

目标：上线 Admin 动态 CRUD 的声明式 skill。

主要任务：

- 新增 skills 和 skill_versions。
- 实现 draft/edit/publish/soft delete。
- 实现 explicit trigger routing。
- 实现 LLM intent router。
- 实现 route decision 记录。
- 实现 chat skill 执行。
- 实现 per-skill allowed tools。
- Admin 支持 skill CRUD、发布、启停、试运行。

退出标准：

- Admin 可创建、编辑、发布、停用、删除 skill。
- Telegram 显式触发 skill 可执行。
- LLM 路由命中、确认和 fallback 行为有记录。
- skill run 指向不可变 skill version。
- disabled 或 deleted skill 不会被路由。

## Phase 7: Workflow Skills And Long Tasks

目标：用 Cloudflare Workflows 支撑长任务。

主要任务：

- 定义 workflow skill step schema。
- 支持 step 类型：
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
- 新增 skill_runs 和 skill_run_steps。
- Workflow 每步写 D1 trace。
- 大输出写 R2 artifact。
- Admin 显示 workflow timeline。

退出标准：

- Admin 可创建 workflow skill。
- Telegram 或 Admin 手动触发 workflow skill。
- 短结果发 Telegram。
- 完整 artifact 和 trace 可在 Admin 查看。
- 失败 step 能显示错误和上下文摘要。

## Phase 8: Scheduling

目标：实现 Admin 管理的定时任务。

主要任务：

- 新增 schedules 表。
- 配置一个 Cloudflare Cron Trigger tick。
- scheduled handler 扫描 due schedules。
- 启动对应 skill workflow。
- Admin 支持创建、暂停、恢复、手动触发 schedule。

退出标准：

- schedule 能按 timezone 计算 nextRunAt。
- due schedule 能触发 skill run。
- schedule history 可查。
- 失败不会无限快速重试。

## Phase 9: Web Search

目标：提供 Cloudflare-friendly 联网搜索能力。

主要任务：

- 实现 `SearchProvider` 接口。
- 接入首个 provider。
- 实现 `web_search`、`fetch_url`、`summarize_sources`。
- 实现搜索预算、max results、domain allow/deny。
- Admin 提供搜索配置和 test query。
- 记录 web_search_runs 和 web_search_results。

退出标准：

- web_search 可返回带 URL 的结果。
- fetch_url 阻止 localhost、私网地址和 metadata IP。
- search-based answer 必须带 citation。
- Admin 可查看搜索 trace。

## Phase 10: Cloudflare RAG

目标：迁移 RAG 到 D1 + R2 + Vectorize。

主要任务：

- 原始文档存 R2。
- 文档 metadata 和 chunk 存 D1。
- embedding upsert 到 Vectorize。
- RAG indexing 走 Workflow。
- 检索使用 Vectorize + keyword fallback + rerank。
- Admin 支持文档列表、索引状态、重建索引、debug query。

退出标准：

- 文档导入后可异步完成索引。
- 向量检索可按 owner/document metadata 过滤。
- keyword fallback 可用。
- answer 引用 source title 和 chunk。
- RAG debug 显示 vector 命中、keyword fallback、rerank reason。

## Phase 11: Eval And Observability

目标：把现有 eval/trace 能力迁移到 Cloudflare 目标路径。

主要任务：

- eval case schema 迁到 shared。
- eval runner 可作为 Workflow 执行。
- Admin 支持 eval dashboard。
- runs/tool_calls/skill_runs/rag_queries/search_runs 建立统一 trace view。
- 记录 token、cost、latency、provider error 分类。

退出标准：

- mock eval 可在 CI 跑。
- Admin 可触发真实 eval。
- eval result 能跳转到相关 run/skill run。
- trace 能复盘一次请求的 route、tools、RAG、search、approval 和 workflow。

## Phase 12: Final Cleanup

目标：删除迁移期历史冗余，只保留 Cloudflare-native 架构。

必须删除或废弃：

- `src/` 旧 Node runtime。
- `dist/` 构建产物主路径。
- `Dockerfile`。
- `docker-compose.yml`。
- `better-sqlite3` 依赖。
- Telegraf polling runtime。
- SQLite `jobs` worker 作为执行队列。
- server-rendered Admin UI。
- SQLite 文件部署说明。
- 旧 `.env` 生产启动流程。

文档更新：

- `README.md` 改为 Cloudflare 架构。
- `docs/architecture.md` 改为目标架构或归档旧架构。
- `docs/deployment.md` 改为 Wrangler/Cloudflare 部署。
- `docs/roadmap.md` 移除已迁移完成的旧 Node/SQLite 路线。
- `docs/demo-script.md` 更新为 Telegram webhook + Admin SPA 演示。

依赖检查：

```bash
rg "better-sqlite3|Telegraf|docker compose|Dockerfile|SQLite job|polling|ADMIN_TOKEN"
```

允许出现的情况：

- 历史迁移说明中说明旧路径已删除。
- changelog 中作为历史背景出现。

不允许出现的情况：

- README 或部署文档仍指导用户使用旧架构。
- package.json 仍保留旧 runtime 依赖。
- CI 仍构建旧 Node runtime。
- Admin 仍使用 query token 登录。

最终退出标准：

- `npm install`、typecheck、test、build 通过。
- Worker dry-run deploy 通过。
- Admin SPA build 通过。
- mock eval 通过。
- Cloudflare Worker 能处理 Telegram webhook。
- Admin Telegram Login 只允许 owner。
- Skill CRUD、chat skill、workflow skill、schedule、web search、RAG 基础链路可用。
- 仓库主文档只描述 Cloudflare-native 目标架构。

