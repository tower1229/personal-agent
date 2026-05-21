# Demo Script

这是一份 v1.0.0 演示脚本，建议先准备有效 `.env`、执行 `npm run db:migrate`，再启动 `npm run dev`。

## 1. 创建待办

Telegram 输入：

```text
帮我创建一个待办：明天晚上复盘 Personal Agent 发布清单
```

预期：

- Bot 返回已创建/已记录待办。
- Admin Dashboard `/admin/ui/runs` 出现一条 succeeded run。
- run detail 里能看到 `create_todo` tool call。

继续输入：

```text
列出我的待办
```

预期看到刚才创建的待办。

## 2. 保存记忆

Telegram 输入：

```text
记住：我更喜欢用 TypeScript 学 Agent 工程
```

预期：

- Bot 回复已记住或已保存。
- `/admin/ui/memories` 出现 active memory。
- run detail 里能看到 `save_memory` tool call。

## 3. 重复记忆去重

Telegram 再次输入：

```text
记住：我更喜欢用 TypeScript 学 Agent 工程。
```

预期：

- Bot 不应声称新增了一条不同记忆，应提示已经记得或已更新已有记忆。
- `/admin/ui/memories/:id` 可看到 duplicate/update/merge 相关 memory event。

## 4. 上传文档

准备一个小于 2MB 的 `.md` 或 `.txt` 文件，例如：

```markdown
# Personal Agent Release

v1.0.0 的目标是把 Telegram Bot、Agent runtime、tool calling、memory、approval、RAG、workflow、Admin Dashboard、eval 和 Docker 整理成可展示项目。
```

在 Telegram 向 Bot 上传该文件。

预期：

- Bot 回复导入成功和 chunk 数量。
- `/admin/ui/documents` 出现文档。
- `/admin/ui/documents/:id/chunks` 可查看 chunk metadata、headingPath 和 embedding 状态。

## 5. 基于文档问答

Telegram 输入：

```text
根据我上传的文档，v1.0.0 的目标是什么？
```

预期：

- Bot 基于文档回答。
- 回复末尾包含类似 `依据：<sourceTitle> / chunk <chunkIndex>` 的来源。
- run detail 的 RAG Debug 显示 `retrievalMode`、`score`、`rerankScore`、`sourceTitle`、`headingPath`。

再输入一个文档中没有的问题：

```text
根据我上传的文档，火星农业预算是多少？
```

预期：Bot 明确说明没有找到相关信息或证据不足，不编造答案。

## 6. destructive approval 确认码

Telegram 输入：

```text
删除关于 TypeScript 学 Agent 工程的那条记忆
```

预期：

- Bot 不直接删除。
- Bot 说明这是破坏性操作，给出过期时间和 `确认 <code>` 格式，并提示可回复 `取消`。
- `/admin/ui/approvals` 出现 pending approval，risk level 为 `destructive`。

错误确认：

```text
确认
```

预期：Bot 提示需要确认码，不执行删除。

正确确认：

```text
确认 <Bot 给出的 code>
```

预期：

- Bot 回复已删除记忆。
- approval 状态变为 `executed`。
- memory 状态变为 `deleted`，不是物理删除。

## 7. daily brief workflow

先准备至少一个待办、一条记忆和一份文档，然后 Telegram 输入：

```text
生成今日简报
```

预期：

- Bot 返回中文今日简报。
- `/admin/ui/workflows` 出现 `daily_brief`。
- workflow detail 显示 `list_open_todos`、`load_important_memories`、`search_recent_documents`、`generate_brief`、`save_result` steps。

## 8. Admin Dashboard 查看 run trace

打开：

```text
http://localhost:3000/admin/ui?token=<ADMIN_TOKEN>
```

演示路径：

- `/admin/ui/runs`：按最新 run 查看请求。
- `/admin/ui/runs/:id`：展示 trace timeline、tool calls、approval requests、workflow、RAG debug。
- `/admin/ui/approvals`：查看 pending/executed/expired approval。
- `/admin/ui/evals`：查看 eval run 和失败 case。

## 9. Eval 运行结果

本地执行：

```bash
npm run eval:mock
```

预期：

- 控制台输出每条 case 的 PASS/FAIL。
- 最后一行输出 total、passed、failed、passRate。
- `/admin/ui/evals` 可查看 eval run。

发布前可执行真实模型 eval：

```bash
npm run eval
```

真实 eval 需要有效模型配置，结果可能随模型输出波动。
