# LLM-as-a-judge 评估框架重构与新记忆架构整合

在先前的 `/grill-me` 对话中，我们针对 `personal-model-design.md` 的初衷对评估框架进行了压力测试，达成了对“锋利与温和边界”以及“事实幻觉 vs 逻辑推演”的共识。
同时，确认了新的记忆架构设计：`log memory`（最近10天的近期记忆）、`Core memory`（长期行为模式）和 `SOUL`（长期价值观）。
因此，“旧数据滥用”的概念不再适用，取而代之的是“上下文的时间加权”。

本计划将上述共识转化为实际代码实现，同步推进**底层记忆架构扩展**与**裁判模型打分逻辑升级**。

## User Review Required

> [!IMPORTANT]
> 1. 我计划保留数据库中的 `old_data_misuse_score` 字段以避免破坏性迁移，但会在 Admin 前端将其重命名为 `Context Weighting`，并在裁判 Prompt 中将其重新定义为“对 10 天 log memory 的时间加权能力”。是否同意此处理方式？
> 2. `SOUL` 将作为 `user_profiles` 表的一个新字段（类似于 `core_memory`）引入，并在 Admin 的 Profile 页面提供编辑入口，同时暴露 `update_soul` 给 Agent。这是否符合您的期望？

## Proposed Changes

### Database & Repository Layer
新增 `soul` 字段支持，并实现 `log memory` 的按时间提取。

#### [NEW] `apps/worker/migrations/0019_soul_profile.sql`
- 编写 SQL: `ALTER TABLE user_profiles ADD COLUMN soul TEXT;`

#### [MODIFY] `packages/shared/src/schemas.ts`
- 在 `UserProfile` 和相关 DTO schema 中增加 `soul: z.string().nullable()`。

#### [MODIFY] `apps/worker/src/repositories.ts` & `apps/worker/src/repositories/d1/mappers.ts`
- 更新 Profile 相关的映射器和接口，支持读写 `soul` 字段。
- 在 repositories 中新增 `getRecentLogMemories(ownerTgUserId: number, sinceTimestamp: number, limit: number)` 方法，用于拉取最近 10 天的 `memories` 记录。

---

### Context Assembly & Agent Runtime
将新的记忆架构（Log memory + SOUL）正式注入给 LLM，确保 Agent 能“看见”它们。

#### [MODIFY] `apps/worker/src/agent.ts`
- 注册新的外部工具 `update_soul`，允许 Agent 像更新 Core memory 一样直接更新 SOUL。
- 在 `executeLlmAgent` 的 Context 组装逻辑中：
  - 加载 Profile 时，将 `SOUL` 作为最高层级价值观注入（例如：`[最深层价值观/SOUL]\n${profile.soul}`）。
  - 调用 `getRecentLogMemories` 获取 `now - 10 * 24 * 60 * 60` 以内的记忆，格式化为 `[近期日志记忆 / Log Memory (最近10天)]\n...`，并随其他 Profile Context 一同注入 LLM 的 System Prompt。

#### [MODIFY] `apps/admin/src/pages/profile-page.tsx`
- 在 Admin 的 Profile 页面中，在 Core Memory 卡片旁增加一个新的 Textarea 卡片用于手动编辑 `SOUL`。

---

### Evaluation Framework (LLM-as-a-judge)
将 `/grill-me` 中达成的评估共识落实到代码中。

#### [MODIFY] `apps/worker/src/agentEvaluator.ts`
- **大幅重写 `prompt`**，引入详细的 Rubric (打分标准)：
  - **Groundedness**: 明确区分事实幻觉与逻辑推演。规定：如果编造了未发生的事实扣分（1分）；如果基于 Context 进行敏锐的深层逻辑推演以揭示谬误，不视为幻觉，反而应属于高阶能力范畴（5分）。
  - **Advice Fit & Emotional Calibration**: 明确“高阶自我映射”的定义。要求评价 Agent 是否能“敏锐地发现深层谬误并一针见血指出（锋利），且表达时不带个人立场和情绪，不批评也不谄媚（温和）”。以此为基准判定 1-5 分。
  - **Context Weighting (原 Old Data Misuse)**: 废除原有的旧数据惩罚。改为评估：“Agent 是否正确地兼顾了不同架构的时间权重？即把 SOUL 和 Core memory 视为长期稳定的模式，同时对最近 10 天的 Log memory 做了正确的时间加权处理（例如意识到这是近期的临时状态而非永久定性）？”

#### [MODIFY] `apps/admin/src/pages/evaluations-page.tsx`
- 将表格表头和说明中的 `Old Data Misuse` 视觉重命名为 `Context Weighting`（或“上下文加权”），让管理员直观理解新版评分逻辑。

## Verification Plan

### Automated Tests
- 运行所有 Vitest 测试，确保现有的记忆测试、Profile CRUD 不会被 `soul` 字段的加入破坏。
- 新增单元测试：验证 `agent.ts` 能够正确加载不超过 10 天的 log memory，并且 `update_soul` 工具能够正确更新数据库。

### Manual Verification
- 部署到本地 / dev 环境。
- 在 Admin 面板更新一段 SOUL 和 Core Memory。
- 在 Telegram 里发送一条 `记录理解：我今天很高兴`。
- 再次对话时，检查 Agent 的内部日志，确认 System Prompt 里成功同时携带了 `SOUL`、`Core Memory` 和最近的 `Log Memory`。
- 查看后台 Evaluations 面板，确认新维度的打分 (Groundedness, Context Weighting 等) 正常生成，并且其背后的 Reasoning 确实反映了新版“锋利但温和”、“逻辑推演不扣分”的 Rubric 标准。
