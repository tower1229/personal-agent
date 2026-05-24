# Deployment

本文覆盖本地开发、Docker 启动、环境变量、SQLite volume、安全和备份建议。

Cloudflare Worker 版本的部署手册见 [Cloudflare Workers.dev Runbook](./cloudflare-workers-dev-runbook.md)。当前迁移期允许旧 Node/SQLite 运行时与 Cloudflare Worker 运行时并存；线上优先验证 Worker 路径。

## 本地开发启动

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

`npm run dev` 会同时启动：

- Telegram Bot polling
- Hono Admin API，默认 `http://127.0.0.1:3000/admin`
- 同进程 SQLite Job Worker，用于处理文本消息、文档导入和 RAG indexing

生产模式：

```bash
npm run build
npm start
```

## Docker 启动

```bash
docker compose build
docker compose run --rm personal-agent npm run db:migrate
docker compose up -d
docker compose logs -f personal-agent
```

停止：

```bash
docker compose down
```

Compose 行为：

- 读取 `.env`
- 设置容器内 `ADMIN_HOST=0.0.0.0`
- 将 Admin API 映射到宿主机 `127.0.0.1:${ADMIN_PORT:-3000}`
- 将宿主机 `./data` 挂载到容器 `/app/data`

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 创建 Telegram Bot 后得到的 token |
| `OPENAI_API_KEY` | OpenAI-compatible provider API key |
| `OPENAI_BASE_URL` | OpenAI-compatible API 地址，可选 |
| `OPENAI_MODEL` | Chat completion 模型名称 |
| `EMBEDDING_PROVIDER` | Embedding provider 标识，默认 `openai-compatible` |
| `EMBEDDING_MODEL` | Embedding 模型名称 |
| `USER_TIMEZONE` | 用户默认时区，用于相对日期解析 |
| `DATABASE_URL` | SQLite 文件路径，默认 `data/personal-agent.sqlite` |
| `ADMIN_TOKEN` | Admin API Bearer token |
| `ADMIN_PORT` | Admin API 端口，默认 `3000` |
| `ADMIN_HOST` | Admin API 监听地址，本地默认 `127.0.0.1` |
| `NODE_ENV` | `development`、`test` 或 `production` |

不要提交 `.env`、真实 API key、Telegram bot token 或 Admin token。

## SQLite Data Volume

默认数据库路径：

```text
data/personal-agent.sqlite
```

Docker Compose 将本地 `./data` 挂载到容器 `/app/data`。这意味着：

- 容器重建不会删除 SQLite 数据。
- 备份宿主机 `./data` 即可备份运行数据。
- 不要把 `data/` 提交到 Git。

## Job Worker 与恢复

当前 worker 与 Bot/Admin 在同一个 Node.js 进程中运行，使用 SQLite `jobs` 表保存任务状态。任务状态包括 `pending`、`running`、`succeeded`、`failed`、`cancelled`。

- 文本消息会先创建 run 和 `handle_text_message` job，再由 worker 执行。
- 文档上传会创建 `ingest_document` job；导入成功后再创建 `index_document_chunks` job。
- worker 通过 SQLite 条件更新领取 job，避免同一个 job 被重复执行。
- 可重试错误会按 attempts 重新排队；超过 `max_attempts` 后进入 `failed`。
- 未耗尽 attempts 的 stale `running` job 会在锁超时后被重新领取；已耗尽 attempts 的 stale `running` job 会进入 `failed`，关联 run 也会失败。
- 进程重启后，SQLite 中的 pending/running/failed job 仍可在 Admin UI 查看；旧 Telegram progress message 的编辑上下文不会跨进程恢复。
- 当前仍是单实例模型，不要同时启动多个容器/进程消费同一个 SQLite 数据库。

## Admin API 安全注意事项

- Admin API 是开发/演示调试接口，不应直接暴露公网。
- 默认本地监听 `127.0.0.1`，Docker Compose 也绑定宿主机 loopback。
- JSON API 必须使用 `Authorization: Bearer <ADMIN_TOKEN>`。
- Dashboard 的 `?token=<ADMIN_TOKEN>` 只适合本地浏览器调试，token 可能进入浏览器历史、代理日志或截图。
- 生产部署建议放在 VPN、SSH tunnel、内网或带访问控制的反向代理后面。
- 定期轮换 `ADMIN_TOKEN` 和模型 provider key。

## 备份建议

最小备份对象：

- `.env` 的安全副本，保存在密码管理器或 secret manager 中。
- `data/personal-agent.sqlite`
- 仓库代码和迁移文件。

SQLite 在线备份建议：

```bash
sqlite3 data/personal-agent.sqlite ".backup 'data/personal-agent.backup.sqlite'"
```

如果没有 `sqlite3` CLI，可先停止服务再复制 `data/personal-agent.sqlite`，避免复制到半写入状态。

## 常见问题

### Bot 没有回复

- 检查 `TELEGRAM_BOT_TOKEN` 是否有效。
- 检查是否已经有另一个进程在 polling 同一个 bot。
- 查看 `npm run dev` 或 Docker logs。

### Admin API 401

- 检查 `ADMIN_TOKEN` 是否和请求 header/query token 一致。
- JSON API 使用 Bearer header；query token 只用于 `/admin/ui`。

### 数据库迁移失败

- 确认 `data/` 目录可写。
- 执行 `npm run db:migrate` 前确认 `DATABASE_URL` 指向预期路径。
- 测试环境可能使用临时数据库，不要和生产数据混用。

### RAG 没有 vector score

- provider 可能不支持 embeddings，或 `EMBEDDING_MODEL` 配置不可用。
- RAG indexing 可能仍在 `pending`，或 `index_status=failed`。
- 系统会 fallback 到 keyword 检索，文档入库仍可成功。
- 可在 `/admin/ui/documents` 和 `/admin/ui/jobs` 查看索引状态和失败原因。

### 真实 eval 失败

- 真实 eval 依赖模型输出，可能有波动。
- 先运行 `npm run eval:mock` 判断工程链路是否稳定。
- 再查看 `/admin/ui/evals/:id` 的失败原因和关联 run。
