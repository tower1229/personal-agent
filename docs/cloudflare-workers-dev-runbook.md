# Cloudflare Workers.dev Runbook

本文是 Phase 6.5 的上线执行手册，目标是把当前 Cloudflare Worker 版本部署到 `workers.dev`，并验证 Telegram、Admin、D1、Schedule、LLM 和联网搜索闭环。

当前已决策：

- 部署入口先使用 `workers.dev`。
- LLM provider 使用 DeepSeek OpenAI-compatible API。
- DeepSeek 默认配置：`LLM_API_BASE_URL=https://api.deepseek.com`，`LLM_MODEL=deepseek-v4-pro`。
- DeepSeek 官方文档说明 `deepseek-chat` / `deepseek-reasoner` 将在 2026-07-24 后废弃；上线前优先确认当前可用模型。

参考：DeepSeek API docs <https://api-docs.deepseek.com/>

## 0. 本地预检

在仓库根目录执行：

```bash
npm install
npm run typecheck
npm run typecheck:workspaces
npm run build:workspaces
npm test
```

如果 Windows 本机出现 Wrangler 写入用户目录日志的 `EPERM`，优先确认杀毒/权限/同步盘占用；这类问题不代表 Worker 代码构建失败。

## 1. 登录 Cloudflare

```bash
npx wrangler login
npx wrangler whoami
```

## 2. 创建 D1 数据库

```bash
cd apps/worker
npx wrangler d1 create personal-agent-db
```

把命令输出里的 `database_id` 写入 [apps/worker/wrangler.toml](../apps/worker/wrangler.toml)：

```toml
[[d1_databases]]
binding = "DB"
database_name = "personal-agent-db"
database_id = "<cloudflare-d1-database-id>"
migrations_dir = "migrations"
```

应用远端 migration：

```bash
cd apps/worker
npx wrangler d1 migrations apply personal-agent-db --remote
```

也可以从仓库根目录执行：

```bash
npm run d1:migrate:worker:remote
```

部署后可以在 Admin Settings / Diagnostics 查看 D1 schema readiness。若显示缺表，先重新执行远端 migration，再刷新 Admin：

```bash
npm run d1:migrate:worker:remote
```

## 3. 配置 Worker vars

非密钥配置在 [apps/worker/wrangler.toml](../apps/worker/wrangler.toml) 的 `[vars]` 中维护：

```toml
TELEGRAM_BOT_USERNAME = "your_bot_username_bot"
OWNER_TG_USER_ID = "<your-numeric-telegram-user-id>"
LLM_API_BASE_URL = "https://api.deepseek.com"
LLM_MODEL = "deepseek-v4-pro"
LLM_MAX_TOOL_ROUNDS = "3"
FETCH_URL_MAX_BYTES = "200000"
```

注意：

- `TELEGRAM_BOT_USERNAME` 不带 `@`，且必须以 `bot` 结尾。
- `OWNER_TG_USER_ID` 必须是 Telegram 数字 ID，不是 `@shixiong`。
- DeepSeek 模型名上线前可通过 DeepSeek 控制台或 models API 再确认一次。

## 4. 配置 Cloudflare secrets

在 `apps/worker` 目录执行，每条命令会提示你粘贴密钥值：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put LLM_API_KEY
npx wrangler secret put BRAVE_SEARCH_API_KEY
```

说明：

- `LLM_API_KEY` 填 DeepSeek API key。
- `BRAVE_SEARCH_API_KEY` 可选；不配置时 Admin diagnostics 会显示 search 未配置，联网搜索相关测试会失败。
- 不要把真实 secret 写入 `.env.example`、`.dev.vars.example`、文档或截图。

## 5. 部署 Worker

从仓库根目录执行：

```bash
npm run deploy:worker
```

或在 `apps/worker` 目录执行：

```bash
npx wrangler deploy
```

记录部署输出中的 `workers.dev` URL，例如：

```text
https://personal-agent-worker.<your-subdomain>.workers.dev
```

后续用 `<WORKER_URL>` 代表该地址。

## 6. 配置 Telegram Login 域名

在 Telegram 里打开 BotFather：

```text
/setdomain
```

选择你的 bot，然后输入 workers.dev hostname，不带协议和路径：

```text
personal-agent-worker.<your-subdomain>.workers.dev
```

Telegram Login 不能在 localhost 完整验证，必须使用线上域名。

## 7. 配置 Telegram webhook

用你的真实 token、worker URL 和 webhook secret 执行：

```bash
curl.exe -X POST "https://api.telegram.org/bot8966479686:AAH-wXkTI9VfkKCihaWbC-bsvbr78FMDV_s/setWebhook" -d "url=https://personal-agent-worker.refined-x.workers.dev/telegram/webhook" -d "secret_token=bf91448ad8d7583ac598c9aae56d9127701ef0b58f81098ffc80d8857ed944c3"
```

检查 webhook：

```bash
curl.exe "https://api.telegram.org/bot8966479686:AAH-wXkTI9VfkKCihaWbC-bsvbr78FMDV_s/getWebhookInfo"
```

期望：

- `url` 指向 `<WORKER_URL>/telegram/webhook`
- `last_error_message` 为空或无近期错误

## 8. 线上 smoke checklist

### Worker / Admin

- [ ] `GET <WORKER_URL>/api/admin/health` 返回 `{ ok: true }`
- [ ] `<WORKER_URL>/admin` 能打开 SPA
- [ ] Telegram Login 按钮出现
- [ ] 用 owner Telegram 账号登录成功
- [ ] 非 owner 登录被拒绝
- [ ] Admin Settings / Diagnostics 显示 D1 schema `ready`
- [ ] Admin dashboard 能加载 runs / todos / memories / approvals

### Telegram core bot

- [ ] owner 发送 `/start` 有响应
- [ ] owner 发送 `新增待办：部署 smoke test` 创建 todo
- [ ] owner 发送 `列出我的待办` 能看到 todo
- [ ] owner 发送 `完成待办 <id>` 能完成 todo
- [ ] owner 发送 `记住：workers.dev smoke 已通过` 保存 memory
- [ ] owner 发送 `搜索记忆 smoke` 能检索 memory
- [ ] owner 发送 `删除记忆 <id>` 创建 approval
- [ ] owner 发送 `确认 <code>` 后才删除 memory
- [ ] 非 owner 消息不会写入业务数据

### Skill

- [ ] Admin 创建 chat skill
- [ ] 发布并启用 chat skill
- [ ] Telegram `/skill <skillId> hello` 能触发
- [ ] trigger phrase 能触发
- [ ] Admin 能看到 skill run / route decision

### Schedule

- [ ] Admin 创建 daily schedule
- [ ] `run now` 能立即执行
- [ ] Admin 能看到 schedule execution
- [ ] 到点后 cron 自动触发一次
- [ ] 重复 cron 不会重复执行同一个 `scheduled_for`

### LLM / Search

- [ ] Admin Settings 显示 LLM configured
- [ ] Admin `test-llm` 成功返回文本
- [ ] 普通 Telegram 消息在未命中命令/skill 时进入 LLM fallback
- [ ] Admin Settings 显示 Brave Search configured
- [ ] Admin `test-search` 成功返回结果
- [ ] skill allowedTools 包含 `web_search` 时可以调用搜索
- [ ] `fetch_url` 只接受 `http` / `https` URL

## 9. 回滚

如果部署后出现严重问题：

```bash
cd apps/worker
npx wrangler deployments list
npx wrangler rollback
```

如果 Telegram webhook 指向坏版本，先清空 webhook：

```bash
curl.exe -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

然后修复并重新部署，再执行 `setWebhook`。

## 10. Phase 6.5 完成标准

- [ ] `workers.dev` URL 可访问 Admin。
- [ ] owner Telegram Login 成功。
- [ ] Telegram webhook 能处理 owner 消息。
- [ ] D1 remote migration 已应用。
- [ ] Skill / Schedule / LLM / Search smoke 均至少跑通一次。
- [ ] 失败路径在 Admin trace 中可定位到 run / tool_call / schedule_execution。
