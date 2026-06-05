# Cloudflare Migration Plan

当前仓库已经切到 Cloudflare Worker + D1 + React Admin SPA 主路径。旧的 workflow skill / Cloudflare Workflows 长任务方案已移除，不再作为迁移目标。

## Current Baseline

- Telegram webhook 由 Worker 处理。
- Admin SPA 由 Worker Static Assets 提供。
- D1 保存 runs、tool calls、todos、memories、approvals、skills、skill runs、schedules 和 schedule executions。
- Skill 仅保留 `chat` 类型。
- Schedules 由单个 Cron Trigger 轮询 D1 执行。
- LLM/Search 通过 OpenAI-compatible client、Brave Search 和 `fetch_url` 实现。

## Next Migration Work

1. 巩固现有 Cloudflare 主路径
   - 部署 smoke 自动化。
   - Admin 关键页面加载和错误态检查。
   - D1 readiness 覆盖当前真实必需表。

2. 增加自动长任务能力
   - 以 `docs/planning/long-task-planning.md` 为准。
   - 先用 D1 持久化 long task / step / event。
   - 用 Cron 或后续 Queues 恢复执行。
   - 不恢复旧 workflow skill 编辑器。

3. RAG / Documents
   - 文档元数据进入 D1。
   - 大内容进入 R2。
   - 检索 trace 进入 Admin。

4. Eval
   - 覆盖普通命令、Agent Skill、LLM fallback、search/fetch、schedule、long task classifier。

## Removed Scope

- `kind: workflow`
- `workflowTemplate`
- Cloudflare Workflow binding
- Workflow Admin page
- Workflow run / step API surface
