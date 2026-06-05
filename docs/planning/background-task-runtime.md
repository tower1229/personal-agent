# 后台任务运行时 (Task Ledger + Detached Execution)

## 目标

为个人 Agent 提供一个可靠、轻量的机制，将耗时任务从交互式聊天会话中剥离到后台运行。该机制允许 Agent 执行长耗时任务，记录其状态，支持取消，并在完成后通知用户。

这将取代之前的“长任务引擎 / Planner”概念。现在的目标**不是**构建一个带有动态重规划和评估器等复杂组件的通用任务编排引擎。相反，重点在于为脱离主会话的后台工作构建一个可靠的“活动账本 (Activity Ledger)”，类似于 OpenClaw 的后台任务机制。

## 设计哲学

对于个人 Agent 而言，最关键的需求是能够放心地将已知的长耗时操作交接出去，而不阻塞当前的交互式会话。

- **后台任务 (Background Task)** 是一个活动账本，记录了发生了什么、发生时间以及最终结果。
- **交互式聊天 (Interactive Chat)** 专用于问答、指令和简单的命令。后台任务将这些耗时领域分离出来。
- 我们将分三层演进此能力，当前阶段严格聚焦于第一层。

## 演进架构

### 第一层：任务账本 / Task Ledger (当前优先级)
这是核心基础设施。它允许任务被剥离、记录和监控。
- 明确区分交互式会话与后台任务。
- 仅做状态记录、支持取消和主动通知。
- 对于不确定的任务，默认留在交互式会话中处理，不要强行塞入后台任务。

### 第二层：模板化步骤 / Template-based Steps (未来/可选)
针对那些模式固定且确实需要较长时间（如 10-30 秒以上）的场景（如：文档处理流水线、多步骤代码扫描）。
- 步骤由代码模板定义，而不是由 LLM 动态规划生成。
- 为用户提供更细粒度的进度追踪。

### 第三层：LLM Planner / 动态重规划 (暂缓)
- 带有动态步骤生成、效果评估和 HITL (Human-In-The-Loop，人工干预) 恢复的通用 Planner。
- 当前阶段避免构建此能力。它引入的巨大复杂性（评估器、状态机、上下文裁剪等）远超过其在典型私人 Agent 场景下的收益。
- 仅在未来针对高度特定、极度复杂的领域时再做考虑。

## 数据模型 (第一层)

新增 D1 数据表以追踪后台任务：

```text
tasks
  id
  user_id (例如 owner_tg_user_id)
  source_message_id (用于关联触发该任务的聊天上下文)
  type: "document_processing" | "research" | "workflow" | "cron" | "tool_run"
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"
  title
  input (JSON 或文本)
  result_summary (JSON 或文本)
  error (JSON 或文本)
  created_at
  updated_at
```

*(未来的第二层扩展可能会引入 `task_steps` 表)*

## 用户体验

用户主要通过 Telegram 与后台任务进行交互：

- `/start task <任务描述>` (或者在调用已知重型工具时自动触发)
- `/list tasks` - 查看正在运行和最近完成的任务。
- `/show task <id>` - 查看特定任务的详细状态（作为后备查询手段）。
- `/cancel task <id>` - 终止一个正在运行的任务。
- **原地进度消息 (In-Place Progress Message):** 任务开始时会发送一条 Telegram 消息，并在状态流转时（`queued` -> `running` -> `terminal`）通过 `editMessageText` 原地更新该消息，避免刷屏。当任务达到终态时，消息最终形态将包含 `result_summary` 或 `error`。

## 实现策略

1. **Schema 与 Repositories**
   - 编写 `tasks` 表的 D1 迁移脚本。
   - 实现 `TaskRepository` 以支持基本的 CRUD 操作。

2. **脱离执行 (Runtime)**
   - 避免在 webhook 请求内同步执行繁重的操作，改为派发到后台 worker 执行（例如使用 Cloudflare Queues，或者对于较短的任务使用 `ctx.waitUntil`，但 Queues 对于真正的后台可靠性来说更安全）。
   - 确保任务在状态流转时（`queued` -> `running` -> `terminal`）实时更新 D1 数据库中的状态。

3. **Telegram 指令**
   - 实现 `/list tasks`, `/show task`, `/cancel task` 指令。
   - 实现通知派发器 (Notification Dispatcher)，在任务完成时向用户推送消息。

4. **集成现有重型工具**
   - 挑选 1-2 个容易超时或执行时间过长的现有能力（例如：大型代码库扫描、重度文档解析）。
   - 将它们封装进新的任务账本 (Task Ledger) 机制中运行。

## 第一层验收标准

- 一个长耗时操作可以被派发到后台执行，并立即释放 Telegram 聊天流。
- 用户可以通过 `/list tasks` 指令查看队列中或正在运行的任务。
- 任务在后台执行完成，并自动更新数据库状态。
- 用户会收到一条包含最终结果摘要或错误信息的自动 Telegram 通知。
- 正在运行的任务支持被取消，取消后立即停止后台执行（或者至少将其标记为已取消并在下一个检查点停止）。
