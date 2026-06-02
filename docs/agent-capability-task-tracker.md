# Agent Capability Task Tracker

本文档跟踪 Personal Agent 后续主线优化任务。每项任务按当前实现证据、目标状态、建议推进顺序和验收口径记录；实际执行时按对话节奏逐项展开。

## 任务总览

| ID | 主线任务 | 状态 | 优先级 | 备注 |
| --- | --- | --- | --- | --- |
| T1 | 标准 Agent Skill 协议迁移 | 首版实施中 | P0 | 彻底替换当前 D1 chat skill manifest，迁移到 `agentskills.io` 的 `SKILL.md` 目录协议。 |
| T2 | 长任务后台执行与 Telegram 进度体验 | 部分完成 | P0 | 已有后台续跑、状态查询、Admin trace；缺少中间进度主动推送。 |
| T3 | 临期待办与主动提醒 | 待设计 | P0 | 当前 todo 无 due/reminder 字段；Schedule 是独立命令调度，不是 todo 提醒。 |
| T4 | LLM routing 与结构化工具规划 | 部分完成 | P1 | 当前是规则路由 + 复杂度分类；缺少语义 intent routing 和 confidence 策略。 |
| T5 | 搜索引用质量 | 部分完成 | P1 | 已有 Brave Search 与 URL 要求；缺少结构化 citation 和最终答案校验。 |
| T6 | fetch_url 正文抽取与摘要 | 部分完成 | P1 | 已有限制字节和 HTML 去标签；缺少可靠正文抽取、摘要和截断提示。 |
| T7 | Telegram 长任务进度消息 | 部分完成 | P1 | 与 T2 相关，但可作为独立 UX 专项推进。 |

## T1. 标准 Agent Skill 协议迁移

### 当前状态

- 首版已切到 `SKILL.md` 文件映射、parsed metadata、file inventory 和 validation result。
- 显式触发身份是 `/skill <name>`，其中 `name` 来自 `SKILL.md` frontmatter。
- `scripts/`、`references/`、`assets/` 首版只做索引、展示和校验；不执行 scripts。

### 目标状态

- 支持导入或创建符合 Agent Skills 规范的 skill 目录。
- 标准 Agent Skills 协议成为唯一 skill 实现；旧 chat skill manifest 不作为长期运行时分支保留。
- 至少支持：
  - `SKILL.md` frontmatter 与 Markdown body。
  - `scripts/`、`references/`、`assets/` 的目录约定。
  - 本地/远程 skill 校验。
  - Admin 中展示标准 skill metadata。
- 明确一次性迁移策略：旧 D1 chat skill 只用于数据转换，不保留独立 kind、旧 API 或旧 Admin 编辑体验。

### 待明确问题

- 标准 skill 是否必须可通过 Telegram 触发？
- 标准 skill 的脚本执行环境是否允许，允许到什么权限级别？

### 验收口径

- 一个符合规范的 `SKILL.md` 目录可以被导入并触发。
- 无效 frontmatter 或缺失 `SKILL.md` 会被拒绝，并返回可理解错误。
- 旧 chat skill manifest 被迁移或移除，不再作为运行时分支出现。

## T2. 长任务后台执行与 Telegram 进度体验

### 当前状态

- 长任务会在复杂度分类后创建 `long_task`、plan、steps、events。
- Worker scheduled handler 会调用 `resumeDueLongTasks` 续跑 stale running tasks。
- Telegram 支持 `状态`、`暂停`、`继续`、`取消`。
- Admin 有 Long Tasks 列表、详情、steps 和 events。
- 当前主动 Telegram 消息主要是计划摘要和完成通知，中间步骤进度没有主动推送。

### 目标状态

- 长任务能稳定后台执行，不依赖用户保持会话。
- 用户发出任务后，可以通过 Telegram 看到：
  - 任务已接收。
  - 简明计划。
  - 关键进度 checkpoint。
  - 阻塞/等待用户确认。
  - 最终结果与残余风险。
- Admin trace 和 Telegram 进度描述保持一致。

### 验收口径

- 一个超过单 tick 步数上限的任务能由 cron 续跑完成。
- 用户能在 Telegram 用 `状态 <taskId>` 获取当前步骤和完成数。
- 后台完成后会主动发送最终结果。
- 中间进度推送不会刷屏，只在有意义 checkpoint 出现。

## T3. 临期待办与主动提醒

### 当前状态

- `todos` 只有 `title/status/created_at/completed_at`。
- Telegram 命令只支持创建、列出、完成待办。
- Schedule 支持 daily/weekly 执行任意 command text，并会发送 Telegram 消息。
- `dueAt` 只出现在 eval setup schema，没有真实业务链路。

### 目标状态

- todo 支持 due time/reminder policy。
- 临期或到期时由 cron 主动提醒。
- 用户可以通过自然语言或命令创建带时间的待办。
- Admin 可以查看和编辑 due/reminder 状态。

### 已明确决策

- “临期”的默认提前量：提前 15 分钟。
- reminder 策略：一次性提醒。触发即止，避免过度打扰。
- overdue 是否继续提醒：不继续提醒。

### 验收口径

- `新增待办：明天下午三点提交材料` 能保存 due time。
- cron 到提醒窗口后会发送 Telegram 提醒。
- 已完成待办不会继续提醒。
- Admin 能看见 due/reminder 字段和下一次提醒时间。

## T4. LLM Routing 与结构化工具规划

### 当前状态

- 当前路由顺序是 explicit `/skill <name>`、built-in command、name/description semantic skill routing、complexity classifier、LLM fallback/long task。
- 旧 `intentExamples`、`autoRunThreshold`、`confirmThreshold` 已从标准 skill runtime 中移除。
- 长任务 planner 已要求结构化 JSON steps 和 tool policy。

### 目标状态

- **全局 Intent 管理**：在 D1 中新建 `skill_intents` 表，在 Admin UI 维护 skill 对应的特征意图示例，作为语义路由 few-shot 提示。
- **低置信度确认**：定义置信度阈值（如 `<0.5` fallback，`0.5~0.75` confirm，`>0.75` execute）。低置信路由通过 Telegram Inline Keyboard 发起“确认/取消”询问，并在 callback 中继续执行。
- **轻量 Planner**：普通 LLM fallback 对工具型请求生成可追踪的结构化 plan，并用 plan 约束可调用工具、记录实际工具调用和偏离；复杂多步任务继续交给 long task workflow，高风险动作进入确认/审批。

### 验收口径

- `/skill <name>` 之外的自然语言也能通过语义路由命中合适 skill。
- route decision 记录包含候选项、置信度、选择原因。
- 低置信输入不会误触发高影响操作。
- 工具型普通 fallback 的 run trace 能看到 execution plan、actual tool calls 和 plan deviation。

## T5. 搜索引用质量

### 当前状态

- `web_search` 使用 Brave Search，返回 title、url、description、rank。
- system prompt 要求使用搜索或网页内容时包含 URL。
- 最终引用主要依赖模型遵守提示，没有结构化 citation 校验。

### 目标状态

- 搜索结果、引用片段、最终答案引用形成可追踪链路。
- Admin run detail 能看到 search result 与最终回答的引用关系。
- 最终答案缺引用时可被检测或修复。

### 验收口径

- 搜索型问题的最终回复包含来源 URL。
- Admin trace 能显示每条引用来自哪个 search result。
- 对无来源结论能降级为“不确定”或要求继续查证。

## T6. fetch_url 正文抽取与摘要

### 当前状态

- `fetch_url` 只允许 `http` / `https`。
- 有最大字节数限制。
- 当前正文提取是简单 HTML 去标签并截断。
- 没有显式摘要、正文质量评估或截断提示。

### 目标状态

- 更稳地抽取正文、标题、来源和关键段落。
- 对超长内容进行摘要，并保留引用片段。
- 明确告诉模型内容是否被截断。

### 验收口径

- 常见文章页能抽出主体内容，而不是导航/脚注噪音。
- 超长页面不会爆上下文，并能生成可引用摘要。
- 非 HTML 或异常页面能给出明确错误。

## T7. Telegram 长任务进度消息

### 当前状态

- 长任务创建时会发送计划摘要。
- cron 后台完成时会发送最终结果。
- step 级事件写入 D1，但不主动推送 Telegram。

### 目标状态

- 设计统一的进度通知策略：
  - 计划完成。
  - 关键步骤开始或完成。
  - 等待用户确认。
  - 失败和可恢复建议。
  - 最终完成。
- 避免频繁刷屏，支持合并或节流。

### 验收口径

- 一个多步后台任务至少能收到计划、关键进度、完成三类消息。
- 短任务不发送多余进度。
- 失败任务会说明失败步骤和下一步选择。

## 建议推进顺序

1. T1：先明确 skill 协议边界，否则后续 routing 和工具规划会反复受影响。
2. T2 + T7：补齐长任务后台体验和 Telegram 进度闭环。
3. T3：把 todo 从简单清单升级为可提醒任务。
4. T4：在 skill/long task 边界稳定后优化 routing。
5. T5 + T6：提升联网信息质量，作为 routing 和长任务调研能力的基础。

## 维护规则

- 每次开始一个主线任务前，先把该任务拆成当前批次目标。
- 每次完成一批，更新状态、验收结果和残余风险。
- 不把临时实现计划写进产品结论；任务文档只保留稳定决策和可验证目标。
