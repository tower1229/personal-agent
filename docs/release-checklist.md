# Release Checklist

Personal Agent v1.0.0 发布前检查清单。

## Build / Test / Eval

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run eval:mock`
- [ ] `npm run eval`

## Docker

- [ ] `docker compose build`
- [ ] `docker compose run --rm personal-agent npm run db:migrate`
- [ ] `docker compose up -d`
- [ ] `docker compose logs -f personal-agent` 无启动错误

## Admin

- [ ] Admin health check 通过：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/health
```

- [ ] `/admin/ui` 可打开
- [ ] `/admin/ui/runs` 可查看 run 列表
- [ ] run detail 可看到 trace timeline、tool calls、approval、workflow 或 RAG debug
- [ ] `/admin/ui/jobs` 可查看 job backlog，pending/running/failed 状态合理
- [ ] `/admin/ui/documents` 可查看 `indexStatus`、`indexError`、`indexedAt`

## Telegram Smoke Test

- [ ] `/start` 有响应
- [ ] 创建待办成功
- [ ] 保存记忆成功
- [ ] 重复记忆不会新增明显重复 active memory
- [ ] 上传 `.md` 或 `.txt` 文档成功
- [ ] 基于文档问答包含来源
- [ ] destructive approval 只回复 `确认` 不会执行
- [ ] destructive approval 回复 `确认 <code>` 后才执行
- [ ] 重复发送同一个确认码不会二次执行
- [ ] approval 工具执行失败时状态为 `execution_failed`
- [ ] `生成今日简报` 可生成 workflow 记录
- [ ] 文档导入后会创建 indexing job，embedding 失败时仍可 keyword fallback

## Secrets / Repo Hygiene

- [ ] `.env` 未提交
- [ ] `data/` 未提交
- [ ] README 和 docs 中没有真实 API key、Telegram bot token、Admin token
- [ ] `.env.example` 只包含占位符
- [ ] `git status --short` 中没有意外文件

## Documentation

- [ ] README 链接有效
- [ ] `docs/architecture.md` 包含 Mermaid 架构图
- [ ] `docs/demo-script.md` 可按步骤完成演示
- [ ] `docs/deployment.md` 覆盖本地、Docker、环境变量、volume、安全、备份和 FAQ
- [ ] `docs/learning-notes.md` 覆盖 Agent 工程复盘
- [ ] `docs/roadmap.md` 覆盖后续路线
