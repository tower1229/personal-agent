# Personal Agent

一个用于学习的小型个人 Agent 运行系统。当前已实现 Telegram Bot、OpenAI-compatible 模型调用、SQLite + Drizzle 运行记录、todo 工具调用、长期记忆系统、简单文档 RAG、代码编排的 workflow、Hono Admin API、Eval 和 Docker 部署。

## 项目功能总览

- Telegram Bot：接收文本消息和文本类文档上传
- Agent tool calling：todo、memory、document RAG tools
- Human-in-the-loop approval：高风险工具先创建 approval request
- Memory system：保存、搜索、删除长期记忆
- Document RAG：保存文档、chunk 切分、关键词检索
- Workflow：`daily_brief` 多步骤工作流
- Observability：runs、tool_calls、workflows、workflow_steps、approval_requests
- Admin API：Hono JSON API 查看调试数据
- Eval：固定测试集评估 Agent 行为
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
- `approval_requests`：记录高风险工具执行前的用户确认请求
- `documents`：记录用户保存的文档
- `document_chunks`：记录文档切分后的检索片段
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

当前 `tool_calls.run_id` 仍允许为空。后续做 observability 时，建议把 `runs` 生命周期改成先创建 `running` run，再把 run id 传入 Agent，最后更新 run 的最终状态。

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

## Week 4 Approval 使用示例

高风险工具不会被 Agent 直接执行，会先创建 approval request。

```text
用户：删除关于 TypeScript 的那条记忆
Agent：即将删除关于 TypeScript 的记忆。请回复“确认”或“取消”
用户：确认
Agent：已删除
```

如果用户回复：

```text
取消
```

Bot 会拒绝当前 pending approval，不会执行对应工具。

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

上传后，Bot 会下载文件内容，按 UTF-8 当作纯文本解析，调用统一的文档入库逻辑，写入 `documents` 和 `document_chunks`。JSON / CSV 暂时也按纯文本导入，不做结构化解析。

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
GET /admin/tool-calls
GET /admin/workflows
GET /admin/workflows/:id
GET /admin/memories
GET /admin/approvals
```

这些接口只用于开发调试，不会返回 `.env`、Telegram Bot token、OpenAI API key 或 Admin token。

## Week 8 Eval

Eval cases 位于 [eval/cases.json](eval/cases.json)，固定使用：

```text
userId = eval-user
chatId = eval-chat
```

运行：

```bash
npm run eval
```

Eval runner 会：

- 读取 `eval/cases.json`
- 调用现有 Agent 或 `daily_brief` workflow
- 捕获单条 case 错误，不中断整轮 eval
- 检查 expected keywords、forbidden keywords、tool_calls 和 approval_requests
- 写入 `eval_runs` 和 `eval_results`
- 输出总数、通过数、失败数和通过率

当前 tool/approval 评分使用 eval user + 最近时间窗口关联。后续把 runs 生命周期改成先创建 run 后，可以用 runId 做精准关联。

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

- 文档检索是关键词匹配，暂未使用 embedding 或向量数据库。
- `tool_calls.run_id` 仍可能为空，observability 关联依赖时间窗口或 metadata。
- Eval 是行为 smoke test，不是严格单元测试；模型输出波动可能导致部分 case 失败。
- Telegram 文档上传只支持 2MB 以下文本类文件。
- Approval 只有 Telegram 文本“确认/取消”，暂无 Web UI。
- SQLite 适合本地学习和小规模部署，不适合多实例并发写入。

## 下一步计划

- 将 runs 生命周期改为 `running -> succeeded/failed`，并把 runId 传入工具和 workflow。
- 为 document RAG 增加 embedding 检索和 chunk rerank。
- 为 Admin API 增加只读 HTML dashboard。
- 为 destructive approval 增加过期时间、审计详情和更明确的操作摘要。
- 增加自动化测试和 CI。
