# Personal Agent

一个基于 Telegram、OpenAI-compatible LLM、SQLite 和 Hono Admin API 的个人 Agent 项目，用来展示从 tool calling、memory、approval、RAG、workflow 到 eval/trace/deployment 的完整工程闭环。

## 功能总览

- Telegram Bot：文本对话、文本类文档上传、进度 trace 更新。
- Agent runtime：OpenAI-compatible chat completion、最多 8 轮 tool calling、工具参数 Zod 校验。
- Todo tools：创建、查询、完成待办。
- Memory system：保存、搜索、软删除长期记忆；支持去重、访问统计、事件审计和 embedding fallback。
- Approval：高风险/破坏性工具先创建 approval request；destructive 操作必须回复 `确认 <code>`。
- Hybrid RAG：文档入库、Markdown/文本 chunking、keyword + embedding 混合检索、本地 rerank、来源引用。
- Background jobs：SQLite job queue + 同进程 worker，后台处理文本消息、文档导入、RAG indexing 和 eval。
- Workflow：`daily_brief` 代码编排工作流。
- Observability：runs、jobs、tool_calls、approval_requests、workflows、workflow_steps、eval_runs、eval_results。
- Hono Admin API + Dashboard：只读查看 run trace、jobs、tool calls、approvals、RAG debug、workflow steps、eval 结果。
- Eval：固定 case 回归，支持 mock LLM 和真实模型。
- Docker / CI：容器化运行，GitHub Actions 执行 build/test/mock eval。

## 技术栈

- Runtime：Node.js 22、TypeScript、tsx
- Bot：Telegraf
- API/UI：Hono、`@hono/node-server`
- LLM：OpenAI SDK + OpenAI-compatible provider
- Data：SQLite、better-sqlite3、Drizzle ORM / drizzle-kit
- Validation：Zod、zod-to-json-schema
- Test/Eval：Vitest、自研 eval runner
- Deployment：Docker、Docker Compose

## 快速启动

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

需要在 `.env` 中配置 `TELEGRAM_BOT_TOKEN`、`OPENAI_API_KEY`、`OPENAI_MODEL`、`ADMIN_TOKEN` 等变量。不要提交 `.env` 或任何真实 token/API key。

生产构建：

```bash
npm run build
npm start
```

## Telegram Bot 使用

启动后在 Telegram 打开 Bot，发送 `/start` 或普通文本消息。常用演示：

```text
帮我创建一个待办：明天晚上复盘 Agent 项目
列出我的待办
记住：我更喜欢用 TypeScript 学 Agent
根据我保存的文档，Week 8 要做什么？
生成今日简报
```

支持上传 `.txt`、`.md`、`.markdown`、`.json`、`.csv` 文本文件，单文件限制 2MB。上传后会导入知识库，可继续基于文档提问。

## Admin Dashboard 使用

Admin API 默认监听 `127.0.0.1:3000`，base path 为 `/admin`，所有 JSON API 都需要：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

健康检查：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/health
```

Dashboard 页面：

```text
http://localhost:3000/admin/ui?token=<ADMIN_TOKEN>
```

页面包括 runs、run detail、jobs、trace timeline、RAG debug、approvals、memories、documents、workflows、evals。query token 仅用于本地调试，公网/生产环境不要使用。

## Eval 使用

```bash
npm test
npm run eval:mock
npm run eval
```

- `npm test`：Vitest 单元测试，不调用真实模型。
- `npm run eval:mock`：使用 mock LLM 跑 `eval/cases.json`，适合 CI 和行为回归。
- `npm run eval`：调用真实模型，需要有效 provider 配置，结果可能受模型输出波动影响。

## Docker 部署

```bash
docker compose build
docker compose run --rm personal-agent npm run db:migrate
docker compose up -d
```

Compose 会读取 `.env`，将宿主机 `./data` 挂载到容器 `/app/data`，并将 Admin API 绑定到 `127.0.0.1:${ADMIN_PORT:-3000}`。

## 项目亮点

- 不是只做聊天入口，而是覆盖 Agent 工程核心链路：tool calling、approval、memory、RAG、workflow、observability、eval。
- `runId` 贯穿用户消息、tool calls、approval、workflow 和 eval scoring，便于复盘一次请求的完整执行链路。
- 高风险操作默认先审计再执行，破坏性操作要求确认码，降低误删风险。
- RAG 有可解释 debug 信息：retrieval mode、keyword/vector score、rerank score、heading path、source title、chunk index。
- Admin Dashboard 保持只读，适合演示和排障，不引入独立前端工程复杂度。
- mock eval 可在 CI 中稳定验证行为边界，真实 eval 用于发布前人工验收。

## 当前限制

- SQLite 适合本地学习、小规模单实例运行，不适合多实例高并发写入。
- RAG embedding 存在 SQLite JSON 中，暂未接入专用向量数据库。
- rerank 是本地规则，暂未使用专用 reranker model。
- Telegram 文档上传仅支持 2MB 以下文本类文件，不支持 PDF、DOCX、XLSX、图片 OCR。
- Approval 只能通过 Telegram 文本确认，Admin Dashboard 不提供执行/取消写操作。
- 真实 eval 是行为 smoke test，不是确定性单元测试。

## 下一步路线

- 将 RAG 迁移到专用向量数据库。
- 引入更稳定的 reranker model。
- 改进 Admin UI 的筛选、对比和 trace 复盘体验。
- 增强 background jobs 的取消入口、backlog 监控和失败恢复演练。
- 增加 backup / restore 工具。
- 强化 production deployment：反向代理、HTTPS、secret 管理、日志轮转、监控告警。

## 文档

- [Architecture](docs/architecture.md)
- [Demo Script](docs/demo-script.md)
- [Deployment](docs/deployment.md)
- [Learning Notes](docs/learning-notes.md)
- [Roadmap](docs/roadmap.md)
- [Release Checklist](docs/release-checklist.md)
