# Roadmap

后续路线以“增强可靠性、可观测性和部署成熟度”为主，不优先堆叠复杂新功能。

## RAG 使用专用向量数据库

- 将 SQLite JSON embedding 迁移到专用向量数据库。
- 保留 SQLite 中的文档元数据、chunk metadata 和审计记录。
- 明确向量索引重建流程和 fallback 策略。

## Reranker Model

- 在本地规则 rerank 之后接入专用 reranker model。
- 评估中文查询、标题匹配、长 chunk、近似语义问题的效果。
- 在 eval 中增加引用准确性和无依据拒答指标。

## 更好的 Admin UI

- 增强 run trace 的对比、筛选和搜索体验。
- 为 RAG debug 增加候选 chunk 对比视图。
- 为 eval failure 增加更清晰的 case diff 和重跑入口。
- 保持默认只读，避免 Admin UI 变成高风险操作面。

## Message Queue / Background Jobs

- 将文档 embedding、长文档导入、eval、定时 workflow 等耗时任务移到后台。
- 增加 job 状态、重试、失败原因和取消机制。
- 避免 Telegram 请求链路被慢任务阻塞。

## Backup / Restore

- 提供明确的 SQLite backup/restore 脚本。
- 支持导出 memories、documents、todos 和 eval results。
- 增加恢复演练清单，验证备份可用。

## Production Deployment Hardening

- 使用反向代理、HTTPS、访问控制和安全 headers。
- 使用 secret manager 或平台环境变量管理 token。
- 增加结构化日志、日志轮转、健康检查和告警。
- 明确数据库迁移流程和发布回滚策略。
- 将 Admin API 放在 VPN、内网或 SSH tunnel 后面。
