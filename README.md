# Personal Agent

一个用于学习的小型个人 Agent 运行系统。当前已实现 Telegram Bot、OpenAI-compatible 模型调用、SQLite + Drizzle 运行记录、todo 工具调用、长期记忆系统，以及简单文档 RAG。

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

## 启动开发服务

```bash
npm run dev
```

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
