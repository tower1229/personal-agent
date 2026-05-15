# Personal Agent

一个用于学习的小型个人 Agent 运行系统。当前已实现 Telegram Bot、OpenAI-compatible 模型调用、SQLite + Drizzle 运行记录，以及 todo 工具调用。

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
