# Personal Agent

一个用于学习的小型个人 Agent 运行系统。当前第 1 周实现了 TypeScript 项目骨架、Telegram Bot、OpenAI 模型调用、SQLite + Drizzle 运行记录。

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

迁移会创建 `runs` 表，用于记录每次用户消息的输入、输出、状态、耗时和错误信息。

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
