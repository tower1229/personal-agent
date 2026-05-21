# Learning Notes

这个项目的价值不在于新增复杂功能，而在于把个人 Agent 的工程问题从 demo 推到可追踪、可验证、可复盘。

## Tool Calling

- Tool calling 不能只依赖模型自觉，必须有 runtime 层边界。
- 工具参数需要结构化 schema 和运行时校验，避免模型生成非法参数后直接写库。
- 工具执行结果要落库，否则无法复盘模型为什么给出最终回复。
- 工具风险分级应在 registry 层统一处理，而不是分散到每个 prompt 里。

## Memory

- 长期记忆不能简单 append-only，否则很快出现重复、冲突和过期信息。
- 保存记忆前应做 normalize、去重和冲突处理。
- 删除记忆更适合软删除，保留审计和恢复空间。
- 搜索记忆要按 user 隔离，不能因为共享数据库泄漏其他用户数据。
- 自动注入记忆要控制数量，避免 prompt 膨胀和过度使用旧信息。

## Approval

- 高风险操作必须由 runtime 拦截，不能只靠 prompt 提醒模型。
- destructive 操作要求确认码，可以降低误触发和“只回复确认”的风险。
- approval request 需要记录操作摘要、参数、风险级别、过期时间、状态和最终执行的 tool call。
- approval 确认消息本身也是一次 run，应纳入 trace。

## RAG

- RAG 的难点不只是“能搜到”，还包括 chunking、召回、重排、引用和无依据拒答。
- Markdown heading、source title、chunk index 等 metadata 对 debug 很重要。
- Embedding 失败时要能 fallback，否则 provider 能力差异会影响基础可用性。
- Agent 必须被约束为只基于返回 chunks 回答，证据不足要明确说明。

## Workflow

- 有些任务不适合让 LLM 自由规划，代码编排更稳定。
- `daily_brief` 这类固定流程适合拆成 steps，每步记录输入、输出和错误。
- Workflow 和普通 Agent 对话共享 runId，方便在同一个 trace 页面复盘。

## Observability

- 没有 trace 的 Agent 很难调试，因为模型、工具、审批、RAG 和 workflow 都可能影响结果。
- `runs` 是用户请求主线，`tool_calls`、`approval_requests`、`workflows` 是支线。
- run detail 页面比散落 SQL 查询更适合演示和排障。
- progress trace 对用户体验有帮助，但必须只展示安全摘要，不泄露 prompt、token 或完整敏感参数。

## Eval

- Unit test 验证确定性 helper 和工具行为。
- Mock eval 验证 Agent 路由、tool calling、approval、RAG、workflow 等行为边界，适合 CI。
- 真实 eval 用于发布前验收，但不能当作完全确定性的测试。
- Eval setup 数据需要和 case run 区分，scoring 应优先按 runId 查询。

## Deployment

- Docker 解决运行环境一致性，但不等于生产安全。
- SQLite 对个人项目足够简单可靠，但需要明确单实例边界和备份策略。
- Admin API 默认只读和本地监听是合理的安全基线。
- `.env`、token、API key 必须留在 Git 之外，文档和日志都不能泄露真实值。
