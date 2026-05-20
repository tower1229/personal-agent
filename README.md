# Personal Agent

一个用于学习的小型个人 Agent 运行系统。当前已实现 Telegram Bot、OpenAI-compatible 模型调用、SQLite + Drizzle 运行记录、todo 工具调用、长期记忆系统、hybrid 文档 RAG、代码编排的 workflow、Hono Admin API、Eval 和 Docker 部署。

## 项目功能总览

- Telegram Bot：接收文本消息和文本类文档上传
- Agent tool calling：todo、memory、document RAG tools
- Human-in-the-loop approval：高风险工具先创建带确认码、过期时间和审计摘要的 approval request
- Memory system：保存、搜索、删除长期记忆
- Document RAG：保存文档、结构化 chunk 切分、keyword + embedding 混合检索和本地 rerank
- Workflow：`daily_brief` 多步骤工作流
- Observability：runs、tool_calls、workflows、workflow_steps、approval_requests
- Admin API：Hono JSON API 查看调试数据
- Eval：固定测试集评估 Agent 行为，支持 mock LLM
- Unit Tests + CI：Vitest 单元测试和 GitHub Actions 验证
- Docker：标准化容器启动

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

填写以下变量：

| 变量 | 说明 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather 创建 Bot 后得到的 token |
| `OPENAI_API_KEY` | OpenAI-compatible provider API Key，例如 DeepSeek API Key |
| `OPENAI_BASE_URL` | OpenAI-compatible API 地址，DeepSeek 使用 `https://api.deepseek.com` |
| `OPENAI_MODEL` | 使用的模型名称，例如 `deepseek-v4-pro` 或 `deepseek-v4-flash` |
| `EMBEDDING_PROVIDER` | Embedding provider 标识，默认 `openai-compatible` |
| `EMBEDDING_MODEL` | Embedding 模型名称，默认 `text-embedding-3-small` |
| `USER_TIMEZONE` | 用户默认时区，用于解析“明天”“今晚”等相对时间，默认 `Asia/Shanghai` |
| `DATABASE_URL` | SQLite 文件路径，默认 `data/personal-agent.sqlite` |
| `ADMIN_TOKEN` | Admin API Bearer token，仅用于本地调试 |
| `ADMIN_PORT` | Admin API 端口，默认 `3000` |
| `ADMIN_HOST` | Admin API 监听地址，本地默认 `127.0.0.1` |
| `NODE_ENV` | 运行环境，默认 `development` |

不要把 `.env` 提交到 Git。

## 安装依赖

```bash
npm install
```

如果 Windows PowerShell 拦截 `npm.ps1`，可以改用：

```bash
npm.cmd install
```

## 数据库迁移

生成迁移文件：

```bash
npm run db:generate
```

执行迁移：

```bash
npm run db:migrate
```

迁移会创建：

- `runs`：记录每次用户消息的输入、输出、状态、耗时和错误信息
- `todos`：记录用户待办
- `tool_calls`：记录每次工具调用的参数、结果、状态、耗时和错误信息
- `memories`：记录用户长期记忆
- `memory_events`：记录记忆创建、搜索、删除等事件
- `approval_requests`：记录高风险工具执行前的用户确认请求、risk level、过期时间、确认码、结构化操作摘要和执行后的 tool call 关联
- `documents`：记录用户保存的文档
- `document_chunks`：记录文档切分后的检索片段
- `document_chunk_embeddings`：记录 chunk embedding JSON、模型、provider 和维度
- `workflows`：记录 workflow 的输入、输出和整体状态
- `workflow_steps`：记录 workflow 每一步的状态、输入、输出和错误
- `eval_runs`：记录每轮 eval 总体结果
- `eval_results`：记录每条 eval case 的输出和评分

## 启动开发服务

```bash
npm run dev
```

启动后会同时运行 Telegram Bot polling 和 Hono Admin API。Admin API 默认只监听 `127.0.0.1`，不要直接暴露到公网。

生产构建和启动：

```bash
npm run build
npm start
```

## v0.6 Unit Tests + Mock Eval + CI

本项目使用 Vitest 做确定性单元测试，覆盖文本清洗、cosine similarity、approval 确认解析、JSON 安全格式化、progress event 格式化、文档检索打分 helper、核心 tools 和 approval 执行路径。

```bash
npm test
npm run test:watch
```

测试会使用临时 SQLite 数据库、测试 token 和禁用 embedding 的 keyword fallback，不依赖真实 Telegram 用户数据，也不会调用真实模型或 embedding API。

Eval 分两种：

```bash
npm run eval:mock
npm run eval
```

- `npm test`：快速、确定性的 Vitest 单元/工具/approval 测试，不调用真实 API。
- `npm run eval:mock`：运行 `eval/cases.json`，但注入 mock LLM；用于 RAG、tool calling、approval、workflow、prompt 行为相关改动的回归检查，不调用真实模型。该脚本会先执行数据库迁移。
- `npm run eval`：运行真实模型 eval，用于人工验收模型行为，需要有效 `OPENAI_API_KEY`、模型配置和已迁移数据库。

默认验收策略：

- 代码或配置变更默认至少运行 `npm run build` 和 `npm test`。
- 修改 Agent prompt、tool resultJson、eval scoring/cases、RAG 检索、approval 行为、workflow 路由，或其他会影响模型决策链路的内容时，运行 `npm run eval:mock`。
- 只有在改动确实需要验证真实模型行为时才运行 `npm run eval`，例如 prompt 大改、RAG grounding 策略变化、安全/审批策略变化、发布前人工验收，或用户明确要求。
- README、注释、纯 UI 文案等不影响运行行为的改动，不要求运行 eval。

CI 位于 `.github/workflows/ci.yml`，使用 Node 22，执行：

```bash
npm ci
npm run build
npm test
npm run eval:mock
```

CI 不运行 `npm run eval`，因为真实 eval 需要外部 API key，且模型输出存在波动。日常开发也不把真实 eval 作为每次修改的固定步骤。

## 如何测试 Telegram Bot

1. 在 Telegram 中打开 BotFather，创建一个 Bot，拿到 `TELEGRAM_BOT_TOKEN`。
2. 把 `TELEGRAM_BOT_TOKEN`、`OPENAI_API_KEY`、`OPENAI_MODEL` 写入 `.env`。
3. 执行 `npm install`。
4. 执行 `npm run db:generate` 和 `npm run db:migrate`。
5. 执行 `npm run dev`。
6. 在 Telegram 中打开你的 Bot，发送 `/start`，应收到欢迎语。
7. 发送任意文本消息，Bot 会调用模型生成回复，并把本次运行写入 SQLite 的 `runs` 表。

如果模型调用失败，Bot 会返回友好的错误提示，并在 `runs.status` 中记录为 `failed`，同时写入错误信息。

## Telegram Bot 配置

1. 在 Telegram 中打开 BotFather。
2. 创建 Bot 并获取 `TELEGRAM_BOT_TOKEN`。
3. 将 token 写入 `.env`，不要提交到 Git。
4. 启动 `npm run dev` 后，Bot 使用 polling 模式接收消息。

## Week 2 Todo 工具示例

启动 Bot 后，可以在 Telegram 中发送：

```text
帮我创建一个待办：明天晚上学习 Agent tool calling
```

```text
列出我的待办
```

```text
完成第 1 个待办
```

Agent 会让模型决定是否调用 todo 工具。工具参数会先经过 Zod 校验，执行结果会写入 `tool_calls` 表，最终再由模型生成自然语言回复。

用户消息会先创建 `running` run，再把系统生成的 `runId` 传入 Agent 和工具执行上下文，结束后更新为 `succeeded` 或 `failed`。因此正常用户消息触发的 `tool_calls.run_id` 可以精确关联到对应 run。

## Week 3 Memory 使用示例

启动 Bot 后，可以在 Telegram 中发送：

```text
记住：我更喜欢用 TypeScript 学 Agent
```

```text
我之前说过我喜欢用什么语言？
```

```text
删除这条记忆
```

Agent 会在用户明确要求“记住”“以后请记得”“保存这个偏好”时调用 `save_memory`。当用户询问之前说过什么或偏好时，会调用 `search_memory`。每次回复前，Agent 还会自动加载当前用户最多 10 条重要记忆作为上下文，但不会把所有历史聊天塞进 prompt。

## Week 4 / v0.4 Approval Hardening 使用示例

高风险工具不会被 Agent 直接执行，会先创建 approval request。v0.4.0 起，`write_high`、`external_send`、`destructive` 风险级别的工具会写入结构化审批记录，默认 10 分钟过期。破坏性操作必须使用确认码，不能只回复“确认”。

```text
用户：删除关于 TypeScript 的那条记忆
Agent：这是破坏性操作。将删除 1 条记忆：id=12，content=用户更喜欢 TypeScript。请在 10 分钟内回复：确认 4821。回复 取消 可放弃。
用户：确认 4821
Agent：已删除
```

如果用户只回复：

```text
确认
```

Bot 会提示需要确认码，不会执行工具。如果用户回复错误确认码，Bot 会返回“确认码不正确”，并保持 approval 为 pending。

如果用户回复：

```text
取消
```

Bot 会拒绝当前 pending approval，不会执行对应工具。

如果 approval 超过 `expires_at`，Bot 会在处理确认/取消前先把它标记为 `expired`，并提示用户重新发起。

## Week 5 Document RAG 示例

保存一段项目说明文档：

```text
保存这段项目说明文档，标题是 Personal Agent 计划：
这个项目分 8 周实现。Week 5 的目标是文档处理和简单 RAG，先使用关键词检索，不引入向量数据库。
```

根据刚才保存的文档提问：

```text
根据我保存的文档，Week 5 的目标是什么？
```

查询没有依据的问题：

```text
根据我保存的文档，Week 9 要做什么？
```

如果没有检索到相关 chunks，Agent 应明确说明没有在已保存文档中找到相关信息，不应基于常识编造文档来源。

## 上传文档

Telegram Bot 支持直接上传文本类文档并自动导入知识库。

支持文件类型：

- `.txt`
- `.md`
- `.markdown`
- `.json`
- `.csv`

当前文件大小限制为 2MB。暂不支持 PDF、DOCX、XLSX、图片 OCR。

上传后，Bot 会下载文件内容，按 UTF-8 当作纯文本解析，调用统一的文档入库逻辑，写入 `documents`、`document_chunks`，并尽力为每个 chunk 写入 `document_chunk_embeddings`。JSON / CSV 暂时也按纯文本导入，不做结构化解析。

测试步骤：

1. 执行 `npm run dev`。
2. 在 Telegram 中向 Bot 上传一个 2MB 以下的 `.md` 或 `.txt` 文件。
3. 看到类似回复：

```text
已导入文档：filename.md
切分片段：3
你现在可以问：根据我上传的文档，xxx 是什么？
```

4. 继续提问：

```text
根据我上传的文档，项目目标是什么？
```

如果重复上传相同内容，Bot 会回复已跳过重复导入。

## v0.3 Hybrid Document RAG

文档检索已从纯关键词升级为 keyword + embedding 混合检索：

- 入库时每个 chunk 会尝试生成 embedding，并以 JSON 存到 SQLite。
- 查询时先生成 query embedding，再计算 cosine similarity。
- 最终分数：`keywordScore * 0.4 + vectorScore * 0.6`。
- 如果 embedding 生成失败、查询 embedding 失败，或当前 chunk 没有 embedding，会自动 fallback 到关键词检索。
- `search_documents` tool 的结果会包含 `retrievalMode`、`score`、`keywordScore`、`vectorScore`、`sourceTitle`、`chunkIndex`、`headingPath`、`rerankScore` 和 `rerankReasons`。

Embedding 复用现有 OpenAI-compatible SDK 配置：

```env
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_MODEL=text-embedding-3-small
```

如果你的 `OPENAI_BASE_URL` 对应服务不支持 embeddings，文档仍会正常导入，chunk metadata 会标记 `embedding_failed`，检索会使用 `retrievalMode = keyword_fallback`。

## v0.7 Better Chunking + Rerank

v0.7.0 提升文档 RAG 的可解释性和稳定性：

- Markdown 文档优先按 heading / section 切分，并在 chunk metadata 中保存 `headingPath`。
- 普通文本优先按段落切分。
- fenced code block 不会被普通长度切分打断；超长文本段落会再按长度切分并保留 overlap。
- 每个 chunk 的 `metadata_json` 会保存 `sourceTitle`、`sourceType`、`headingPath`、`chunkType` 和 `originalChunkLength`。
- `searchDocumentChunks` 会先召回最多 20 个 hybrid candidates，再用本地规则 rerank 后返回请求的 `limit`。
- rerank 不调用外部 API，规则综合原始 hybrid `score`、exact phrase match、title match、headingPath match、keyword coverage 和 recency。
- `search_documents` 的 resultJson 适合 Admin UI 展示，会返回 `score`、`rerankScore`、`keywordScore`、`vectorScore`、`retrievalMode`、`sourceTitle`、`chunkIndex`、`headingPath` 和 `rerankReasons`。
- Agent 基于文档回答时必须依据 `search_documents` 返回的 chunks；依据不足时应说明没有足够依据，不能编造来源。
- 文档型回答末尾会简短标注来源，例如：`依据：Admin API 配置 / chunk 0`。

## Week 6 Workflow 示例

当前实现了 `daily_brief` workflow。用户发送以下任一文本时，不走普通 Agent 对话，而是直接执行代码编排的 workflow：

```text
生成今日简报
```

```text
今日简报
```

```text
daily brief
```

workflow 会依次执行：

- `list_open_todos`：查询当前用户 open 待办
- `load_important_memories`：加载当前用户最多 10 条重要记忆
- `search_recent_documents`：加载当前用户最近保存的文档
- `generate_brief`：调用模型生成中文简报
- `save_result`：把结果写入 `workflows.output_json`

测试步骤：

1. 先创建一些待办、记忆或上传文档。
2. 在 Telegram 中发送：

```text
生成今日简报
```

3. Bot 会回复今日简报，内容包括今日待办、重要记忆或偏好、相关文档或项目背景、建议行动。
4. 可以用 SQLite 查看执行记录：

```sql
select id, type, status, output_json from workflows order by id desc limit 5;
select workflow_id, step_name, status, error from workflow_steps order by id desc limit 20;
```

## Week 7 Admin API

Admin API 使用 Hono 和 `@hono/node-server`，base path 为 `/admin`。所有接口都需要：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

健康检查：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/health
```

查看 runs：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:3000/admin/runs?limit=20"
```

查看单个 run 详情：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/runs/1
```

其他接口：

```text
GET /admin/tool-calls?runId=1
GET /admin/workflows?runId=1
GET /admin/workflows/:id
GET /admin/documents
GET /admin/documents/:id/chunks
GET /admin/memories
GET /admin/approvals?runId=1
```

`GET /admin/runs/:id` 会返回该 run、精确关联的 tool calls、approval requests、workflow 和 workflow steps。Workflow 既通过 `workflows.run_id` 关联，也会继续在 `runs.metadata_json.workflow_id` 中保留反查信息。

`GET /admin/approvals` 会返回 approval 审计详情，包括 `riskLevel`、`expiresAt`、`operationSummary`、`status`、`approvalCode` 和 `executedToolCallId`。Admin API 是开发者调试接口，必须使用 Bearer token 鉴权，不要暴露到公网。

这些接口只用于开发调试，不会返回 `.env`、Telegram Bot token、OpenAI API key 或 Admin token。

## v0.5 Admin Dashboard UI

Admin Dashboard UI 是基于现有 Hono Admin API 的只读 HTML 调试页面，不引入 React、Vite 或独立前端工程。所有页面都在 `/admin/ui` 下，复用同一个 Admin 鉴权规则：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

curl 访问示例：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/runs
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/runs/1
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/workflows
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/approvals
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/documents
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/ui/evals
```

浏览器调试如果不方便设置 Header，可以临时使用 query token：

```text
http://localhost:3000/admin/ui?token=<ADMIN_TOKEN>
```

query token 只用于开发调试。URL 可能进入浏览器历史、代理日志或截图，生产和公网环境不要使用这种方式。服务端验证 query token 后会设置一个仅限 `/admin/ui` 的 HttpOnly cookie，并重定向到不含 token 的 URL；页面不会把 token 写入 HTML、页面链接、数据库或应用日志。该 cookie 只用于 Admin Dashboard UI，不会让 JSON API 跳过 Bearer token 鉴权。

页面清单：

- `GET /admin/ui`：Dashboard 首页和快捷入口
- `GET /admin/ui/runs`：最近 runs 列表
- `GET /admin/ui/runs/:id`：run detail、tool_calls、approval_requests、workflow、workflow_steps
- `GET /admin/ui/workflows`：workflow 列表
- `GET /admin/ui/workflows/:id`：workflow detail 和 steps
- `GET /admin/ui/approvals`：approval_requests，只读，高风险和过期项会明显标记
- `GET /admin/ui/documents`：documents 列表
- `GET /admin/ui/documents/:id/chunks`：document chunks 和 embedding 状态
- `GET /admin/ui/evals`：eval_runs 列表
- `GET /admin/ui/evals/:id`：eval_results 明细

Dashboard UI 只用于本地开发和调试，不建议暴露到公网。它不会提供 approval 执行、取消或任何写操作。

## v0.5.1 Telegram Progress Trace

Telegram 文本消息现在会先发送一条 progress message，并在处理过程中用 `editMessageText` 更新同一条消息。用户可以看到安全的执行进度，例如：

```text
正在处理...
- 已创建运行记录
- 正在分析请求
- 调用工具：search_documents
- 工具完成：search_documents
- 正在生成最终回复
```

Progress trace 只展示安全状态摘要，不展示模型隐藏思考链、完整 prompt、API key、Telegram token、Admin token 或完整敏感 tool args。

当前实现是兼容性优先的伪流式输出：

- 处理开始后发送 `正在处理...`
- 关键节点通过 `editMessageText` 更新同一条消息
- 最终回答覆盖 progress message
- 如果最终回答超过 Telegram 单条消息限制，会把第一段用于覆盖 progress message，后续内容用 `ctx.reply` 分段发送
- progress 只保留最近 8 条事件，避免超过 Telegram 4096 字符限制
- 处理期间会周期性发送 `typing` chat action

后续如果需要更细粒度的草稿式体验，可以在兼容性验证后再升级到 Telegram `sendMessageDraft`，当前版本不使用它。

## Week 8 Eval

Eval cases 位于 [eval/cases.json](eval/cases.json)。每次 eval run 会使用独立身份，避免污染真实用户和前一次 eval：

```text
userId = eval-user-<evalRunId>
chatId = eval-chat-<evalRunId>
```

真实模型运行：

```bash
npm run eval
```

不调用真实模型的 mock eval：

```bash
npm run eval:mock
```

Eval runner 会：

- 读取 `eval/cases.json`
- 调用统一 `handleUserTextMessage` 服务，和 Telegram 文本消息走同一条 approval、workflow、Agent 路由
- 使用 `--mock` 时注入 mock LLM client，模拟普通回复、tool call、多轮 tool call、空回复错误、destructive tool call 和 `search_documents` tool call，不请求真实模型
- 在每条 case 前执行独立 setup，例如创建待办、保存记忆、导入文档或创建 pending approval
- 捕获单条 case 错误，不中断整轮 eval
- 检查 expected keywords、expectedAnyKeywords、forbidden keywords、tool_calls、approval_requests、approval status、approval code requirement 和 RAG retrievalMode
- 输出 `keywordPassed`、`forbiddenPassed`、`expectedToolsPassed`、`approvalPassed`、`retrievalModePassed`、`failureReasons`
- 写入 `eval_runs` 和 `eval_results`
- 输出总数、通过数、失败数和通过率

运行策略：

- `npm run eval:mock` 用于会影响 Agent 行为、工具调用、RAG、approval 或 workflow 的改动。
- `npm run eval` 只在需要真实模型验收时运行，不作为每次开发修改的固定要求。

Eval 主链路通过 `handleUserTextMessage` 创建 `running` run，并在 scoring 中优先使用 `runId` 精确查询 `tool_calls`、`approval_requests` 和 workflow。只有 case 在 run 创建前失败时，才会 fallback 到 eval user + 最近时间窗口；eval setup 产生的工具调用不属于用户消息 run，因此允许 `tool_calls.run_id` 为 `null`。

清理 eval 数据可以用 SQLite 执行：

```sql
delete from eval_results;
delete from eval_runs;
delete from todos where user_id = 'eval-user';
delete from memories where user_id = 'eval-user';
delete from documents where user_id = 'eval-user';
delete from document_chunks where user_id = 'eval-user';
delete from tool_calls where user_id = 'eval-user';
delete from approval_requests where user_id = 'eval-user';
delete from workflows where user_id = 'eval-user';
```

如果使用新版本的独立 eval 用户，可以按前缀清理：

```sql
delete from eval_results;
delete from eval_runs;
delete from todos where user_id like 'eval-user-%';
delete from memories where user_id like 'eval-user-%';
delete from documents where user_id like 'eval-user-%';
delete from document_chunks where user_id like 'eval-user-%';
delete from tool_calls where user_id like 'eval-user-%';
delete from approval_requests where user_id like 'eval-user-%';
delete from workflows where user_id like 'eval-user-%';
delete from runs where user_id like 'eval-user-%';
```

## Docker 启动

构建镜像：

```bash
docker compose build
```

首次启动前执行迁移：

```bash
docker compose run --rm personal-agent npm run db:migrate
```

启动：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs -f personal-agent
```

停止：

```bash
docker compose down
```

Docker Compose 会读取 `.env`，将 `./data` 挂载到容器 `/app/data`，并把 Admin API 端口绑定到宿主机 `127.0.0.1:${ADMIN_PORT}`。

## 当前限制

- 文档检索已支持 SQLite JSON embedding、TypeScript cosine similarity 和本地规则 rerank，但暂未使用专用向量数据库或外部 reranker 模型。
- 正常 Telegram 文本消息、文档上传、approval 确认和 daily brief 都使用 `running -> succeeded/failed` run 生命周期；eval setup 等非用户消息准备步骤仍可能产生 `run_id = null` 的工具日志。
- 真实 Eval 是行为 smoke test，不是严格单元测试；模型输出波动可能导致部分 case 失败。CI 使用 `eval:mock` 避免这种波动。
- Telegram 文档上传只支持 2MB 以下文本类文件。
- Approval 目前只有 Telegram 文本确认流程，暂无 Web UI；破坏性操作需要 `确认 <code>`。
- SQLite 适合本地学习和小规模部署，不适合多实例并发写入。

## 下一步计划

- 为 document RAG 增加更稳定的中文分词和更严格的引用质量评估。
