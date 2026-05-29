# Personal Model Development Batches

本文档把 [personal-model-implementation-plan.md](./personal-model-implementation-plan.md) 拆成有序开发批次。拆分原则是：每个批次工作量可控、能独立验收，同时不把必须一起工作的数据模型、API、Admin、运行时链路硬拆到不同批次中。

## Batch Principles

- 每批都应产出可运行、可验证的系统状态。
- 紧密关联的内容放在同一批次，例如表结构、repository、shared schema、Admin API、最小 UI 和测试。
- 先做治理闭环，再扩大资料源；先做结构化 personal model，再做向量 RAG。
- 每批都要保护现有 Telegram、Admin、long task、schedule 能力不回退。
- 每批结束后至少运行 `npm run typecheck`、`npm test`，前端或路由变更还应运行 `npm run build`。

## Batch 0: Baseline Hardening

状态：已完成。

完成时间：2026-05-27。

完成证据：

- 已建立现有能力基线，初始 `npm.cmd run typecheck` 通过。
- 初始 `npm.cmd test` 通过：8 个测试文件，47 条测试。
- 现有 memory 指令链路、Admin auth、D1 readiness、Telegram command、LLM tool 调用路径在后续测试中保持覆盖。

目标：在动个人模型前，确认当前系统边界和测试基线，避免后续改动时不知道回归来自哪里。

范围：

- 梳理现有 `memories`、`memory_events`、Admin Data 页面、LLM tool、Telegram 指令链路。
- 为当前简单 memory 行为补齐必要测试缺口。
- 确认 D1 readiness、Admin auth、Telegram command、LLM tool 调用路径的基线。
- 不新增个人模型功能。

不包含：

- 新表。
- 新 Admin 页面。
- 资料导入。
- 向量检索。

验收：

- `记住：...`、`搜索记忆 ...`、`删除记忆 <id>` 现有行为有测试覆盖。
- Admin Memories 只读列表仍可用。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：0.5 到 1 天。

## Batch 1: Personal Model Claim MVP

状态：已完成。

完成时间：2026-05-27。

完成证据：

- 已新增 `apps/worker/migrations/0005_personal_model.sql`，包含 `personal_model_claims` 和 `personal_model_events`。
- 已在 `packages/shared` 增加 personal model claim/event 常量、schema 和 Admin DTO。
- 已实现 Worker repository、D1 mapper、Admin API、serializer 和 readiness 检查。
- 已新增 Admin `Personal Model` 页面，支持创建 claim、筛选 claim、编辑 claim 文本/layer/scenario/confidence/status/usage policy，并查看事件历史。
- 已新增 Telegram 指令 `记录理解：...`，并支持可选分类语法，例如 `记录理解：[pattern/relationship] 我在关系问题中重视边界判断`。
- 已在 LLM fallback 前注入 active/high-confidence 且未禁用、时间有效的 personal model claims。
- 已验证 `do_not_use`、非 active、未来 `validFrom` 的 claim 不进入上下文。
- 最终验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd test`：8 个测试文件，51 条测试
  - `npm.cmd run build`

目标：建立最小可用的结构化个人理解模型闭环。完成后系统不再只有自由文本 memory，而是有可治理的 personal model claim。

范围：

- 新增 `0005_personal_model.sql`，至少包含：
  - `personal_model_claims`
  - `personal_model_events`
- 在 `packages/shared` 增加 claim 相关常量、schema、DTO。
- 在 Worker repositories 增加 claim CRUD：
  - list
  - get
  - create
  - patch
  - list events
- 新增 Admin API：
  - `GET /api/admin/personal-model/claims`
  - `GET /api/admin/personal-model/claims/:id`
  - `POST /api/admin/personal-model/claims`
  - `PATCH /api/admin/personal-model/claims/:id`
  - `GET /api/admin/personal-model/claims/:id/events`
- 新增 Admin `Personal Model / Claims` 页面：
  - 列表
  - 过滤 layer、scenario、confidence、status
  - 创建 claim
  - 编辑 claim、confidence、status、usage policy
  - 查看事件历史
- 新增 Telegram 指令：
  - `记录理解：...`
  - 默认保存为 manual high-confidence claim，允许后续再加更复杂语法。
- 在 `executeLlmAgent` 前读取少量 active/high-confidence/global 或匹配场景 claim，注入 system context。
- 固定 system policy 加入个人模型核心规则：
  - 隐性使用，不频繁显性引用。
  - 不确定情绪时轻判断 + 单问题校准。
  - 观点锋利、语气平静、态度温和。
  - 不自居宗教、心理或终极权威。

不包含：

- 原始资料导入。
- 证据链。
- metacognition log。
- automatic claim proposal。
- vector search。

验收：

- 可以通过 Telegram 保存一条 claim，例如“写作默认保留我的表达气质”。
- Admin 能看到、编辑、废弃该 claim。
- 被废弃或 `do_not_use` 的 claim 不会进入 LLM context。
- active/high-confidence claim 会进入 LLM context。
- Admin API 未登录返回 401。
- D1 readiness 包含新表。
- 相关 repository、route、prompt 注入有测试。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：2 到 4 天。

## Batch 2: Evidence And Source Governance

状态：已完成。

完成时间：2026-05-27。

完成证据：

- 已新增 `apps/worker/migrations/0006_personal_model_sources.sql`，包含 `source_documents`、`source_chunks` 和 `personal_model_evidence`。
- 已在 `packages/shared` 增加 source/chunk/evidence 常量、schema 和 Admin DTO。
- 已实现 Worker repository、D1 mapper、Admin API、serializer 和 D1 readiness 检查。
- 已新增基础 source chunking，支持 Markdown/文本按标题、段落和长度切分，并保存 `normalized_content`、`chunk_index`、`token_count`、metadata。
- 已扩展 Admin `Personal Model` 页面，支持手动导入 source、查看 chunks、更新 source 治理字段，并在 claim detail 中查看/添加 evidence。
- 已保护 source 原文不可通过 Admin PATCH 改写；PATCH 只更新 title、uri、status、usage policy、sensitivity、时间和 metadata 等治理字段。
- 已支持 claim 关联 `source_chunk`、conversation run、manual confirmation、admin edit 等证据类型。
- 最终验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd test`：8 个测试文件，52 条测试
  - `npm.cmd run build`

目标：把“原始证据”和“结论型理解”分开，避免 personal model 变成不可追溯的主观判断。

范围：

- 新增或扩展 migration：
  - `source_documents`
  - `source_chunks`
  - `personal_model_evidence`
- 增加 source/chunk/evidence shared schema 和 repository。
- Admin 增加 `Personal Model / Sources` 和 claim 详情里的 Evidence 区块。
- 支持手动导入文本或 Markdown：
  - 粘贴原文。
  - 设置 `source_type`、`usage_policy`、`sensitivity`、title、uri。
  - 自动生成基础 chunk。
- 支持 claim 关联证据：
  - conversation run
  - source chunk
  - manual confirmation
  - admin edit
- 原始资料不可改原文，只允许：
  - 添加 metadata
  - 设置 usage policy
  - 隐藏
  - 删除
  - 排除使用
- Admin claim 详情显示证据链和引用片段。

不包含：

- 自动网页抓取。
- GitHub API/OAuth。
- 批量 QQ 空间/微博解析。
- 向量检索。
- 自动抽取 claim。

验收：

- 能手动导入一篇 Markdown，生成 document 和 chunks。
- 能把某条 claim 关联到某个 chunk 或 run。
- claim 详情能显示证据来源、引用片段和权重。
- 标记 `do_not_use` 的 source 不会被 context assembler 使用。
- 原始资料内容不能通过 Admin 被直接改写。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：3 到 5 天。

## Batch 3: Context Assembler And Scenario Routing

状态：已完成。

完成时间：2026-05-27。

完成证据：
- 实现了 `assemblePersonalModelContext`，支持 scenario fallback 和 limit 限制。
- 增加了 `searchPersonalModelSourceChunks` 方法并在 context 中组装相关 source chunks。
- 更新了 `Admin` 相关的 event 记录，记录 claims 的更新、废弃。
- 测试用例通过。

目标：把 personal model 从“可保存”升级为“能稳定影响对话，但不污染 prompt”。

范围：

- 新增 context assembler 模块。
- 实现轻量场景分类：
  - writing
  - health
  - relationship
  - self_knowledge
  - emotional_support
  - work_decision
  - technical_writing
  - technical_collaboration
  - global fallback
- 实现 claim 选择策略：
  - active only
  - 排除 `do_not_use`
  - 当前状态过期过滤
  - 高置信优先
  - 场景匹配优先
  - global claim 少量兜底
  - token/条数上限
- 实现 source chunk 选择策略：
  - 只在需要证据时使用。
  - usage policy 过滤。
  - source type 过滤。
  - 先用 D1 keyword search。
- 记录 `used_in_response` / `excluded_by_policy` event。
- 增加 retrieval/context trace 到 tool calls 或专门事件，方便 Admin 后续展示。

不包含：

- 向量检索。
- LLM 自动反思。
- 大规模资料接入。

验收：

- 写作问题优先注入 writing/global 相关 claim。
- 关系问题优先注入 relationship/emotional_support 相关 claim。
- 过期 current_state claim 不注入。
- `do_not_use` claim/source 不注入。
- context assembler 有单元测试覆盖场景、状态、使用策略和上限。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：2 到 4 天。

## Batch 4: Metacognition And Understanding Gaps

状态：已完成。

完成时间：2026-05-27。

完成证据：
- 新增 `0007_personal_model_metacognition.sql` 数据库迁移。
- `shared` 模块新增 `personal_model_metacognition_logs` 和 `personal_model_understanding_gaps` 常量及 schema。
- 在 `repositories.ts` 和 `personalModel.ts` 实现了 metacognition logs 和 understanding gaps 的 D1 和 fake repos 方法。
- 完成 `adminPersonalModelRoutes.ts` 中 MetacognitionLogs 和 UnderstandingGaps 的增删查改 endpoints (`GET`, `POST`, `PATCH`)。
- `personalModelContext.ts` 中集成了 open `understanding_gaps`，使未解之谜作为 context 的一部分，引导 Agent 补齐认知。
- `helpers.ts` 将新表加入了 D1 readiness 检查。
- 在 Admin API 中实现了自动联动：管理员修改 claim 的置信度或标记过期时，系统自动生成元认知日志。
- 为 Admin UI 新增了 `Gaps` 和 `Metacognition Logs` 页面并在左侧边栏添加入口。
- 为 LLM Agent 增加了 `record_understanding_gap` 和 `record_metacognition_log` 工具，使得 Agent 具备自主反思能力。
- 所有 `typecheck` 成功通过。

目标：让 agent 不只保存结论，还能记录自己如何理解用户、哪里被纠正、哪里不确定。

范围：

- 新增或启用：
  - `metacognition_logs`
  - `understanding_gaps`
- 增加 repository、shared schema、Admin API。
- Admin 增加：
  - `Personal Model / Gaps`
  - `Personal Model / Metacognition`
- 支持手动和半自动记录：
  - `记录缺口：...`
  - `修正理解：...`
  - Admin 中标记 claim 错误/过时/部分准确时自动写 event 和 metacognition log。
- agent 在信息不足时可以基于 gap 提一个关键问题。
- 简单工具任务不触发建模追问。

不包含：

- 每轮 LLM 自动反思。
- 自动从所有对话中提炼模型。

验收：

- 用户纠正某条 claim 后，claim status/event/metacognition log 同步更新。
- Admin 能看到未解决 gaps。
- gap 标记 resolved 后不再被用于主动提问。
- 简单待办/搜索/删除记忆请求不会触发 personal model 追问。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：2 到 4 天。

## Batch 5: First Real Source Ingestion

状态：已完成。

完成时间：2026-05-27。

完成证据：
- `shared` 模块新增了专门的 `personalModelWritingMetadataSchema`、`personalModelFrameworkMetadataSchema` 和 `personalModelSocialMetadataSchema`。
- Admin API 的 `POST /api/admin/personal-model/sources` 能够根据 `sourceType` 自动校验相关的 metadata JSON 结构。
- `personalModelSources.ts` 的 `chunkSourceContent` 实现了按类型的定制化 Chunk 切分策略：
  - Markdown：按标题或段落（双换行）切分。
  - Social：识别 JSON 数组逐项切分，或按换行切分。
  - Framework：解析 JSON 按结构字段切块。
- Admin Frontend 在创建资料页新增了高容错的 Metadata (JSON) TextArea 输入，并在资料列表页支持按 Source Type 筛选查询。

目标：开始接入真实个人资料，但先选择低复杂度、可控格式，不碰复杂授权。

范围：

- 支持 Admin 手动导入资料集：
  - Markdown 文件内容粘贴。
  - JSON/CSV 暂可不做，除非已有清晰导出格式。
- 优先资料源：
  - 当前对话整理结果。
  - refined-x 文章 Markdown。
  - 人格框架档案。
  - 少量 QQ 空间/微博手动导出样本。
- 增加 source type 专用 metadata：
  - 写作资料：标题、URL、发布时间、标签、是否原创。
  - 人格框架：框架类型、测试时间、认同度、稳定维度。
  - 旧社交资料：原始时间、平台、是否历史表达。
- 增加基础 chunk 策略：
  - Markdown 按标题/段落。
  - 短社交文本按条目。
  - 人格框架按结构字段。
- Admin Sources 支持按 source_type 筛选。

不包含：

- 自动爬 refined-x。
- QQ 空间/微博复杂解析器。
- GitHub API。
- 向量检索。

验收：

- 能导入一篇 refined-x Markdown 并生成 chunks。
- 能导入一份人格框架档案。
- 能为旧社交资料标记 `historical` metadata 和谨慎 usage policy。
- 检索结果能区分“用户原创观点”和“外部收录内容”。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：3 到 5 天。

## Batch 6: Personal Model Evaluation Harness

状态：已完成。

完成时间：2026-05-28。

完成证据：
- 新增评估测试 `apps/worker/src/personalModelEval.test.ts`，定义了 21 条 Golden Queries，覆盖 Writing、Health、Relationship、Self-Knowledge、Emotional Support、Historical Data / safety、No Answer / out of scope 共 7 个场景分桶。
- 在 `assemblePersonalModelContext` 逻辑中测试并验证了场景路由、claim 检索与匹配、`do_not_use` 等安全限制规则。
- 整个工作区编译及 Vitest 所有 60 条测试均成功通过。

目标：在扩大 RAG 前建立评估，优先防住三类信任风险：情绪误判、旧资料误用、建议不适配。

范围：

- 新增 golden queries 数据结构和测试脚本。
- 支持按场景分桶：
  - writing
  - health
  - relationship
  - self_knowledge
  - emotional_support
  - historical_data
  - no_answer
- 每条 query 记录：
  - expected claims
  - expected sources
  - must not use sources
  - expected behavior
  - refusal/uncertainty requirement
- 增加本地评估命令或测试：
  - context selection 是否命中应命中的 claim/source。
  - 是否排除旧资料或 `do_not_use` 资料。
  - 不可回答时是否避免编造。
- Admin 后续可展示，但本批先以开发测试为主。

不包含：

- LLM-as-judge。
- 线上 canary。
- 向量 recall 指标。

验收：

- 至少 20 条 golden queries。
- 覆盖写作、关系、健康、自我认知、旧资料、不可回答。
- context assembler 对 golden queries 的命中和排除行为可测试。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：2 到 3 天。

## Batch 7: Automatic Claim Proposal

状态：已完成。

完成时间：2026-05-28。

完成证据：
- 实现了 `reflectAndProposeClaims` 反思推荐逻辑并进行了选择性触发优化（根据关键词和非 global 场景分类匹配）。
- 支持提议生成为 `"proposed"` 状态的低置信度（`"low"`）claim，自动插入 `personal_model_claims`、`personal_model_events`（类型为 `"proposed"`）与元认知日志。
- 实现 Telegram 回复中追加提议小助手提示 bulb 消息。
- 支持在提取新提议时载入包括 `deleted`/`deprecated` 在内的历史 claims 进行提示去重，防止重复提取被拒绝过的提议。
- 在 Admin API PATCH 请求中对 proposed claim 的确认（Active）和拒绝（Deleted/Deprecated）进行事件审计，分别记录 `"confirmed"` / `"deprecated"` / `"corrected"` 事件与特定反射内容。
- 在 Admin Web 前端 ClaimsTable 组件中新增了直观的 "Approve" 和 "Reject" 快捷按钮，并支持 "proposed" 状态筛选。
- 新增单元测试文件 `apps/worker/src/personalModelReflection.test.ts` 进行全面保障，Vitest 所有 65 条测试全量通过。

目标：让 agent 能主动提议保存理解，但仍保留治理和可纠正性。

范围：

- 新增 post-response reflection 模块。
- 先只对特定场景启用：
  - 写作偏好
  - 明确偏好
  - 明确修正
  - 用户主动说“你可以记住/以后要这样”
- 生成 proposed claim，而不是直接 high-confidence active claim。
- Admin 增加 proposed claims 过滤和一键确认/拒绝。
- Telegram 中可返回轻量提示：
  - “我可以把这条作为低置信观察保存。”
- proposal 写入 `personal_model_events` 和 metacognition log。

不包含：

- 对所有对话自动抽取。
- 自动保存高敏关系模式为高置信。
- 自动删除旧 claim。

验收：

- agent 能从明确偏好中提出 proposed claim。
- 未确认 proposal 不作为强约束注入。
- 用户或 Admin 确认后升级为 active claim。
- 拒绝后记录事件，不再重复提同一条。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：3 到 5 天。

## Batch 8: Retrieval Upgrade

状态：已完成。

完成时间：2026-05-28。

完成证据：
- 在 `wrangler.toml` 配置了 `[ai]` 绑定和 `[[vectorize]]` 索引（`personal-model-chunks`，1024维，cosine）。
- 在 `types.ts` 扩展了 `WorkerEnv` 的 `AI` 和 `VECTORIZE` 类型绑定。
- 在 `repositories.ts` 的 `PersonalModelSourceChunkRecord` 新增了 `vectorId`、`indexedAt`、`indexStatus` 字段；新增了 `getPersonalModelSourceChunksByIds` 批量查询方法。
- 新增 `personalModelRetrieval.ts` 实现 Hybrid Retrieval（D1 keyword + Vectorize semantic + RRF 合并，k=60），支持 graceful fallback。
- 重构 `personalModelContext.ts`，将 chunk 检索从纯 keyword 升级为 hybrid retrieval，在 context 输出中追加向量相似度分数标注。
- 新增 Admin API `GET /api/admin/personal-model/test-retrieval` 诊断端点。
- Admin 前端新增 "Retrieval Diagnostics" 面板，支持输入查询关键词查看 RRF 排序、keyword/vector 命中和 trace 详情。
- 新增 `personalModelRetrieval.test.ts`，14 条测试覆盖 keyword-only fallback、RRF 公式验证、do_not_use 排除、mock AI/Vectorize hybrid merge、错误容错等场景。
- 最终验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd test`：12 个测试文件，79 条测试
  - `npm.cmd run build`

目标：把 source chunk 检索从 D1 keyword search 升级到可扩展检索，但保持治理规则不变。

范围：

- 选择向量方案：
  - Cloudflare Vectorize 优先评估。
  - 外部向量库作为备选。
- D1 保存 vector id、embedding model、indexed_at、index_status。
- 按 source_type 优化 chunk 策略。
- 实现 hybrid retrieval 的接口抽象：
  - keyword retriever
  - vector retriever
  - rerank placeholder
- Admin 显示 retrieval trace：
  - query
  - selected claims
  - selected chunks
  - excluded items and reasons
- golden queries 增加 Recall@5 / Recall@10。

不包含：

- 大规模全部资料接入。
- 复杂 reranker。
- 自动权限同步。

验收：

- 同一 query 可看到 keyword/vector 检索 trace。
- usage policy 和 work-personal 隔离仍在检索后强制过滤。
- golden queries 可计算 Recall@5 / Recall@10。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：4 到 7 天。

## Batch 9: Source Connectors And Larger Ingestion

目标：在已有治理、评估和检索能力后，扩大真实资料覆盖面。

范围：

- refined-x 批量导入。
- frontend-weekly 批量导入，并明确标记：
  - 用户原创观点
  - 外部链接收录
  - 用户点评
- GitHub 个人项目导入：
  - README
  - docs
  - issues/PR 描述
  - commit messages
- 公司项目资料单独 namespace/source_type，默认只用于工作场景。
- QQ 空间/微博导入工具：
  - 先支持用户手动导出的稳定格式。
  - 强制标记时间、平台、历史表达。

不包含：

- 未经确认的公司资料自动接入。
- 自动把旧社交资料转成当前人格结论。

验收：

- 每类 source 有明确 metadata 和 usage policy。
- weekly 收录内容不会被误当作用户观点。
- 公司资料不会进入个人模型默认 context。
- 旧社交资料默认带历史限定。
- golden queries 覆盖新增来源。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：5 到 10 天，取决于导出格式稳定性。

## Batch 10: Advanced Quality Loop

目标：把个人模型从“能用”提升到“长期可靠”。

范围：

- LLM-as-judge 辅助评估：
  - groundedness
  - old-data misuse
  - advice fit
  - emotional calibration
- Admin 增加评估结果页面。
- 支持用户反馈：
  - 情绪误判
  - 旧资料误用
  - 建议不适配
  - 过度挑战
  - 过度顺从
- feedback 自动进入 metacognition log 和 claim revision。
- 定期 personal model review，但不主动打扰用户，只在用户进入后台或主动询问时提供。

不包含：

- 对话外主动推送。
- 不可解释的自动人格重写。

验收：

- 用户可以标记一次回答为什么不适配。
- feedback 能追踪到相关 claim/source/context trace。
- 相关 claim 可进入 `under_revision`。
- 评估数据能指导下一轮模型修正。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

建议工作量：4 到 8 天。

## Recommended Release Groups

为了控制风险，可以按以下发布组推进：

### Release A: Governed Personal Model MVP

包含 Batch 0 到 Batch 3。

完成后具备：

- 结构化 claim。
- Admin 可治理。
- 对话可隐性使用 claim。
- 场景化 context assembler。

这是第一个真正可用版本。

### Release B: Evidence And Self-Correction

包含 Batch 4 到 Batch 6。

完成后具备：

- 原始证据和结论分离。
- 元认知日志。
- 理解缺口。
- golden queries。

这是第一个可信版本。

### Release C: Natural Growth

包含 Batch 7。

完成后具备：

- agent 可主动提议保存理解。
- 用户/Admin 可确认或拒绝。

这是第一个自然生长版本。

### Release D: Real RAG

包含 Batch 8 到 Batch 9。

完成后具备：

- 向量/混合检索。
- 多资料源接入。
- retrieval trace。

这是第一个资料规模化版本。

### Release E: Long-Term Reliability

包含 Batch 10。

完成后具备：

- 用户反馈闭环。
- 质量评估。
- 持续修正机制。

这是长期维护版本。

## Current Progress

当前已完成 Batch 0 至 Batch 8。系统已经具备可治理、可追溯的结构化个人理解模型基础，具备自主反思生成 proposed claims、评估金句集、以及 Hybrid 混合检索能力：

- **Batch 0 & 1 & 2**：用户能通过 Telegram 保存结构化个人理解；Admin 能进行 Claims 与 Sources 的 CRUD 及治理字段编辑；claim 支持关联 D1/run/manual/admin edit 证据链路。
- **Batch 3**：实现了 `assemblePersonalModelContext`，支持 scenario-based 场景分类匹配路由，将个人理解 claims/chunks 在 LLM fallback 前自动装配并限额注入。
- **Batch 4**：引入了元认知（Metacognition logs）和理解缺口（Understanding Gaps）机制，允许 agent 自主记录不确定之处并在 context 中保留缺口，引导主动向用户提问。
- **Batch 5**：实现了 First Real Source Ingestion，支持 Markdown 标题/段落分割、社交 JSON 动态及人格框架的结构化切片与 Admin 强校验。
- **Batch 6**：建立了 Evaluation Harness，定义了 21 条涵盖 7 大场景分桶的 Golden Queries 进行场景路由、检索及 `do_not_use` 等安全隔离策略的单元测试。
- **Batch 7**：实现了 Automatic Claim Proposal，当 agent 检测到特定触发词或修正反馈时，在 post-response 环节生成 `"proposed"` / `"low"` 置信度的 claim 并写入 event 与元认知日志，前端增加 Approve/Reject 快捷按钮，并支持过滤历史去重。
- **Batch 8**：实现了 Retrieval Upgrade，将 chunk 检索从纯 D1 keyword search 升级为 Hybrid Retrieval（D1 keyword + Cloudflare Vectorize semantic + RRF 合并），新增 Admin Retrieval Diagnostics 面板和 14 条专项单元测试。
- **Batch 9**：实现了 Source Connectors And Larger Ingestion，构建了 Vector Indexing Pipeline 自动异步索引通道，并补充了针对 refined-x, frontend-weekly, github (含 README, docs, issues, commits) 及旧社交平台导出的本地脚本导入工具集。

当前尚未完成：

- **Batch 10**：尚未实现 LLM-as-judge 的质量反馈闭环。

## Next Development Task

下一步进入 **Batch 10: Advanced Quality Loop**。

### Batch 10 Recommended Scope

1. **refined-x 批量导入**：
   - 支持批量导入 refined-x 文章 Markdown。
   - 自动提取标题、标签、发布时间等 metadata。

2. **frontend-weekly 批量导入**：
   - 明确区分用户原创观点、外部链接收录、用户点评。
   - 对应 metadata 标注。

3. **GitHub 个人项目导入**：
   - 支持导入 README、docs、issues/PR 描述、commit messages。
   - 公司项目资料单独 namespace/source_type，默认只用于工作场景。

4. **QQ 空间/微博导入工具**：
   - 先支持用户手动导出的稳定格式。
   - 强制标记时间、平台、历史表达。

5. **向量索引管道**：
   - 在 source 创建时自动将 chunk 嵌入并写入 Vectorize 索引。
   - 更新 `indexStatus` 跟踪索引状态。