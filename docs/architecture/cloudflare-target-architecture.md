# Cloudflare Target Architecture

本文定义 Personal Agent 当前目标架构。当前主路径是 Cloudflare Worker + D1 + React Admin SPA；旧的 workflow skill / Cloudflare Workflows 长任务方案已移除。

## Settled Constraints

- 只支持一个 owner 用户。
- Telegram Bot 是唯一自然语言交互入口。
- Admin 是 owner 控制台，不面向多用户 SaaS。
- Admin 使用 Telegram Login，只允许 owner 的 Telegram numeric user id 登录。
- 部署目标优先兼容 Cloudflare 免费层。
- Skill 第一版是标准 Agent Skill package：以 `SKILL.md` 为核心，支持 Admin 文件映射编辑、发布和启停，不支持 Admin 上传任意 JS/TS 代码执行。
- Skill 触发支持 Telegram `/skill <name>` 显式触发，以及基于 `name/description` 的语义路由；不再支持旧 trigger phrase 路由。
- 定时任务使用 Cloudflare Cron Trigger 触发统一 tick，再由 D1 中的 schedule 表决定具体任务。
- 联网能力使用搜索 API、`fetch_url` 和来源总结，不做浏览器自动化。
- 自动长任务 V1 已实现：复杂消息先分类，再创建 D1 long task、规划步骤、执行 bounded steps，并由 Cron 续跑。

## Non-Goals

- 不做多租户、组织权限、RBAC/ABAC。
- 不支持普通用户访问 Admin。
- 不在 Admin 中动态执行任意代码。
- 不在 Cloudflare Workers 中运行 Playwright、Chrome 或浏览器自动化。
- 不把 Cloudflare Workflows 作为当前长任务抽象。

## Platform Mapping

| 能力 | Cloudflare 组件 | 说明 |
| --- | --- | --- |
| HTTP 入口 | Workers + Hono | Telegram webhook、Admin API、auth callback、静态资源入口 |
| Admin UI | React SPA | 同域部署在 `/admin` |
| 关系数据 | D1 | runs、tools、skills、schedules、long tasks metadata |
| 大文件和 artifact | R2 | 后续用于原始文档、提取文本、长报告、备份导出 |
| 向量检索 | Vectorize | 后续文档 chunk embedding |
| 定时任务 | Cron Triggers | 统一 tick，扫描 D1 schedules，并恢复 stale running long tasks |
| 异步消息 | Queues | 后续可用于更高吞吐的 long task step continuation |
| 配置和密钥 | Wrangler vars/secrets | token、provider key、owner id |

## Runtime Topology

```text
Telegram Webhook
  -> Cloudflare Worker
    -> owner allowlist
    -> run creation
    -> approval router
    -> skill router
    -> command / LLM agent runtime
    -> tool registry
    -> D1
    -> Telegram Bot HTTP API

Admin React SPA
  -> /api/admin/*
    -> Telegram session cookie
    -> owner-only Admin API
    -> Runs / Skills / Schedules / Data / Approvals / Diagnostics

Cron Trigger
  -> scheduled handler
    -> scan due schedules in D1
    -> execute schedule command
```

## Skill Model

Skill is an Admin-managed, declarative chat behavior.

```text
skill
  internal id
  protocol name
  draft files / parsed metadata / validation
  enabled / deleted flags

skill_version
  immutable published package snapshot
  referenced by every skill run
```

Current skill package core:

```text
name
description
SKILL.md body
files inventory
allowed-tools warnings
validation result
```

## Routing

Current routing order:

1. Explicit skill name: `/skill <name> ...`.
2. Deterministic built-in commands.
3. Skill semantic routing by published package `name/description`.
4. Complexity classifier.
5. Simple LLM fallback or long-task planner/executor.

Current routing order inserts long-task classification before ordinary LLM fallback:

```text
message
  -> explicit skill name / built-in command / semantic skill route
  -> complexity classifier
  -> simple LLM answer OR long task plan
```

## Long Tasks

Long tasks are deliberately not implemented through the removed workflow skill system.

Current V1 behavior:

- automatically classify complex requests
- create a persisted plan
- execute bounded, verifiable steps
- support pause/resume/cancel/status
- expose trace in Admin

Detailed plan: `docs/planning/long-task-planning.md`.
