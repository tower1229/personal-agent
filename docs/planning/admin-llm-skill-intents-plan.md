# Admin LLM Capability and Skill Routing Examples Plan

## Background

Personal Agent 的 Admin 目前是 owner-only 控制台，不是多用户 SaaS。既有约束包括：只支持一个 owner、Admin 使用 Telegram Login、部署优先兼容 Cloudflare 免费层、Skill 是标准 Agent Skill package，且不在 Admin 中动态执行任意 JS/TS 代码。

Skill Routing Examples 已经以 `skill_intents` 表落地为语义路由的 few-shot 示例语料。运行时会把每个 runnable skill 的 `name`、`description` 和 `exampleIntents` 组装给 LLM 路由器，要求返回严格 JSON 的匹配结果。Admin 也已经有 Intents 页签，但当前只是手工增删短文本：

- `apps/worker/src/bot.ts`：语义路由读取 `skill_intents` 并作为 `exampleIntents` 输入。
- `apps/worker/src/app/adminSkillIntentsRoutes.ts`：当前只有 list/create/delete。
- `apps/admin/src/pages/skills-page.tsx`：当前 Intents 是 Skill 详情页底部 tabs 之一，只有单条输入框和 Add/Delete。
- `docs/agent-capability-task-tracker.md`：T4 已明确目标是全局 routing example 管理、低置信确认、轻量 Planner。

因此，Skill Routing Example 自动生成不应该设计成一个孤立按钮；它应该成为 Admin LLM 能力的第一个具体场景。

## External Research Summary

主流产品和框架的共同方向：

1. **结构化输出优先**  
   OpenAI Structured Outputs 明确区分 function calling 和 structured response：当模型连接应用工具/数据时用 function calling；当模型要返回可渲染、可验证的数据结构时用 schema response。Structured Outputs 相比 JSON mode 的核心价值是 schema adherence。参考：[OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)。

2. **Agent action 是受限工具，不是万能后台权限**  
   Salesforce Agentforce 把 actions 作为 agent 执行任务和访问数据的构建块，可从 Apex、SOQL、OpenAPI 等受控入口暴露能力。参考：[Agentforce Actions](https://developer.salesforce.com/docs/ai/agentforce/guide/get-started-actions.html)。  
   ServiceNow AI Agents 也把工具、CRUD、脚本、触发器、ACL 明确配置化，并区分单 agent 和多 agentic workflow。参考：[ServiceNow Building AI Agents](https://servicenow.github.io/sdk/guides/building-ai-agents-guide)。

3. **Human-in-the-loop 是生产级默认，而不是补丁**  
   LangGraph HITL 模式会在敏感操作前暂停、展示待执行动作、等待用户 approve/reject/edit 后恢复。参考：[LangChain Human-in-the-Loop](https://docs.langchain.com/oss/python/langchain/frontend/human-in-the-loop)。  
   Retool 的 agent 实践也强调继承既有权限系统，只能访问显式提供的工具，敏感操作执行前增加 human approval。参考：[Retool AI Agents](https://retool.com/resources/how-to-build-your-first-ai-agent)。

4. **MCP 的启发是“client controls model access and user interaction”**  
   MCP sampling 让 server 请求 LLM 生成，但由 client 控制模型访问、选择和权限；elicitation 让 server 通过 client 请求用户结构化输入，并要求用户可 review/modify/decline。参考：[MCP Sampling](https://modelcontextprotocol.io/specification/draft/client/sampling)、[MCP Elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)。

5. **安全基线必须外置于 prompt**  
   OWASP LLM Top 10 把 prompt injection、insecure output handling 等列为核心风险。参考：[OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)。OpenAI Model Spec 也强调 agentic context 中对不可逆 side effect 要额外谨慎，并在目标不清时降低不可逆成本。参考：[OpenAI Model Spec](https://raw.githubusercontent.com/openai/model_spec/main/model_spec.md)。

结论：Admin LLM 能力应采用 **上下文受限 + schema 输出 + 草案审阅 + 显式应用 + 审计记录** 的设计，而不是让 LLM 直接调用任意 Admin CRUD。

## Product Direction

目标不是在 Admin 里加一个聊天窗口，而是让 LLM 参与系统管理：

- 在具体管理页面内提供上下文相关的生成、诊断、总结、修复建议。
- LLM 输出必须是 typed draft，先进入 UI 草案区。
- 用户可逐项编辑、接受、拒绝、批量应用。
- 实际写库仍由现有 Admin API 或专门的 apply endpoint 完成。
- 每次 LLM assist 记录输入摘要、上下文快照、输出草案、用户最终动作和错误。

这个方向适合个人 agent：owner 是唯一管理员，Admin 是系统治理界面，LLM 可以帮助 owner 管理自己的 agent，但不能越过 owner 直接成为无约束管理员。

## Skill Detail Interaction Redesign

当前 Skill 详情页的问题：

- 页面单 Card 过长，编辑、发布、验证、测试、runs、routes、routing examples 都堆在同一层。
- Intents 虽然是 tab，但实际含义是 routing examples，位置太靠后，缺少与 routing 诊断的联动。
- Validation、File inventory、Runs、Routes 都以 raw JSON 为主，不利于管理判断。
- Save/Publish/Enable/Delete 等动作和测试/诊断混在一起，操作语义不够分层。

建议改为三段式详情页：

1. **Header / Status Bar**  
   显示 name、enabled、draft/published/deleted、validation status、last published、routing examples last updated、主要 actions：Save Draft、Publish、Enable/Disable、Delete。高风险动作保留确认。Header 必须区分 Skill package version 和 active routing overlay，避免让 owner 误以为 routing example 变更等同于 publish。

2. **Primary Tabs**  
   - `Package`：`SKILL.md` 与 extra files 编辑。
   - `Routing`：Routes、semantic candidates、confidence、Skill Routing Examples 子面板。
   - `Test`：测试输入、输出、tool calls、route decision。
   - `Versions / Audit`：发布版本、历史 run/version 关联、变更记录。

3. **Right Inspector 或顶部 summary blocks**  
   展示 validation issues、file inventory summary、触发格式、最近一次路由命中/失败原因。不要只给 raw JSON，raw JSON 可作为 expandable debug。

Skill Routing Examples 应放在 `Routing` tab 内的子面板，而不是和 Test/Runs 并列的一级 tab。它服务的是语义路由，不是 Skill package 内容本身。

Skill Routing Examples 是 active routing overlay：owner apply 后立即影响 semantic routing，但不触发 Skill publish，不改变 published package version。

## Admin LLM Capability Architecture

新增一个 Admin LLM Assist 能力层，先不引入 MCP server，也不复用 Telegram LLM agent loop。原因：Admin 需要更强的 schema、审计和用户应用边界，而 Telegram runtime 是面向自然语言执行。

首版外部 Admin API 使用窄 endpoint：

```text
POST /api/admin/skills/:id/routing-examples/generate
  input:
    instruction?: string
    options?: skill routing example generation options

  output:
    assistRun:
      id
      capability: "skill_routing_examples.generate"
      target: { type: "skill", id }
      status
      model
      createdAt
    draft:
      typed by capability
    warnings[]
    trace:
      promptVersion
      contextSummary
      token/cost metadata if available
```

先不暴露泛型 `POST /api/admin/llm/assist`。内部仍经过同一个 `adminLlmAssist.run({ capability, target, options })` service，避免未来每个页面一套 prompt；等第二个 Admin LLM Capability 出现后，再评估是否需要统一 HTTP endpoint。

核心模块：

- `adminLlmAssist.ts`：能力注册、上下文装配、调用 LLM、schema parse、错误处理。
- `adminLlmCapabilities/skillRoutingExamplesGenerate.ts`：首个 capability。
- `admin_assist_runs` D1 表：记录 Assist Run、target、prompt version、draft JSON、user action。
- shared schema：为 request/response/draft 建 Zod schema。注意仍遵守 AGENTS.md：number 不用 `.positive()`，用 `.min(1)`。

LLM 输出必须按 schema 校验。DeepSeek/OpenAI-compatible endpoint 如果不能保证 Structured Outputs，就使用“JSON prompt + Zod parse + bounded retry”作为兼容路径，但目标接口仍是 typed draft。

### Assist Run Audit Boundary

Assist Run 是 Admin LLM Assist 的独立审计实体，不复用现有 Telegram/agent `runs`，也不复用 `approval_requests`。

- 每次真正调用 LLM 生成 typed draft，都创建一个 Assist Run。
- LLM 输出无效、用户关闭 review、用户 reject、用户 apply，都要留下最终状态。
- 记录字段至少包括：`capability`、`target`、`promptVersion`、`contextSummary`、`draftJson`、`warningsJson`、`status`、`model`、`createdAt`、`completedAt`。
- 不默认保存完整 raw prompt；可保存截断调试片段或 hash，避免长期复制 `SKILL.md`、runs、personal model context 等敏感上下文。
- `approval_requests` 只用于高风险 apply confirmation，不承载 LLM 生成历史。
- 现有 `runs` 继续表示 Telegram/agent runtime，不混入 Admin assist。

### Owner Apply vs Approval Request

Applying generated Skill Routing Examples does not create `approval_requests`. The Admin review list plus explicit owner `Apply selected` action is the confirmation boundary for this low- to medium-risk routing overlay change.

- `skill_routing_examples.generate` only produces a typed draft.
- `Apply selected` writes selected examples and records applied/edited/rejected outcomes on the Assist Run.
- Duplicate or conflict candidates should be visible and unselected by default.
- Risk control comes from review, editability, `active | disabled` state, route trace explainability, and the ability to disable examples.
- Future high-risk Admin LLM Assist outcomes, such as delete memory, disable skill, publish skill, or changing sensitive personal model governance state, should use `approval_requests` or a stronger confirmation flow.

## Skill Routing Examples Auto Generation

### Inputs

LLM 生成 routing example 时只给必要上下文：

- stable skill id；
- current runnable skill name / description；
- Skill Routing Profile；
- existing routing examples；
- 最近 route decisions 中与该 skill 相关的 matched / near-miss 样本；
- 最多 5 个 Conflict Context candidates；
- Routing Example Language，默认 `zh_conversational`；
- 可选用户 instruction，例如“偏中文口语”“多生成 Telegram 场景”。

不要把所有 runs、所有 skills、所有文件一次性塞入 prompt。Conflict Context 只包含最可能和目标 skill 混淆的少量 Skills，不包含其他 Skill 的完整 `SKILL.md`。

Skill Routing Profile 是 routing 专用输入，不传完整 `SKILL.md`。建议包含：

- `skillId`；
- current name；
- current description；
- parsed frontmatter description；
- 从 `SKILL.md` body deterministic extraction 得到的 purpose/task phrases，最多 800-1200 chars；
- allowed-tools summary；
- existing active examples；
- validation status；
- optional owner instruction。

不传：

- extra files 全文；
- scripts；
- references；
- full `SKILL.md` body；
- assets；
- tool output 或 run raw transcript。

Skill Routing Profile 首版不作为独立持久化模型：

- extractor 是纯函数：current runnable Skill detail -> Skill Routing Profile；
- 默认基于 current runnable/published version，不用未发布 draft；
- UI 未来如需基于 draft 生成，必须显式选择 `use draft package`；
- Assist Run 可保存 `contextSummary` 或 `profileSnapshot` 用于审计；
- 不建单独 profile 表，不让 profile 成为第二个 source of truth；
- publish 后下次生成会从新的 runnable version 重新抽取。

Routing Example Language 默认使用 `zh_conversational`，适配 owner 在 Telegram 中的真实输入方式。可选英文或 mixed；mixed 表示同一表达簇下保留中文和英文变体，不是逐条机械翻译。不要根据 Skill package 的文档语言自动切换默认语言。

Conflict Context candidate 选择规则：

- 最近 route decisions 中与目标 skill 一起出现在 candidates 的 skills；
- 或 name/description 文本相似的 skills；
- 或 active routing examples 近似重叠的 skills；
- 最多 5 个；
- 每个 candidate 只给 `skillId`、current name、description、少量 active example samples、recent conflict reason；
- 数据不足时仍可生成，但 draft warnings 要标明 `conflict context limited`。

### Draft Schema

建议 draft 结构：

```ts
{
  clusters: Array<{
    label: string;
    goal: string;
    suggestedExamples: Array<{
      exampleText: string;
      language: "zh" | "en" | "mixed";
      source: "skill_description" | "skill_routing_profile" | "route_history" | "user_instruction";
      confidence: number; // 0..1
      rationale: string;
      duplicateOfExampleId?: string;
      conflictSkillId?: string;
      conflictSkillName?: string;
    }>;
  }>;
  rejectedCandidates: Array<{
    exampleText: string;
    reason: string;
  }>;
  coverageNotes: string[];
  warnings: string[];
}
```

### UI Flow

在 Skill detail `Routing > Examples` 子面板中：

1. 现有 routing examples 列表支持搜索、批量删除、按创建时间排序。
2. 点击 `Generate` 打开 side panel/dialog：
   - 选择数量：5/10/20；
   - 语言/语气：中文口语（默认）、英文、混合；
   - 生成目标：补齐缺口、基于 Skill Routing Profile、基于失败路由、去重优化；
   - 可填附加要求。
3. LLM 返回 draft 后进入 review list：
   - 按 Routing Example Cluster 展示覆盖面；
   - 每条可编辑 exampleText；
   - checkbox 选择；
   - 显示 rationale/confidence/source/conflict；
   - duplicate/conflict 默认不选中。
4. 用户点击 `Apply selected`：
   - 调用批量 create endpoint；
   - 只写入选中的、通过去重校验的短语；
   - 不持久化 cluster；cluster 只保留在 Assist Run `draftJson` 中；
   - assist run 记录 applied/rejected/edited。

### Backend Apply

新增批量接口比逐条 create 更适合 review flow：

```text
POST /api/admin/skills/:id/routing-examples
  { items: [{ exampleText }], assistRunId? }
```

服务端做：

- routing example canonical relation 使用 `skillId`；
- `skillNameSnapshot` 只作为审计和历史解释字段，不能作为关系主键；
- apply 后 example 立即 active，影响后续 semantic routing；
- apply 不触发 Skill publish，不写入 Skill version；
- 每条 example 支持 `active | disabled` 状态，避免只能删除；
- owner 校验走 `adminOwnerId`，不要继续用裸 `ownerId(c.env)`；
- 长度限制；
- 同一 `skillId` 下做 normalized exact duplicate check；
- normalization 包括 trim、英文 lowercase、whitespace 归一、全角/半角基础归一；
- LLM draft 的 `duplicateOfExampleId` 只是 review hint，服务端不能依赖它作为唯一校验；
- 跨 skill 相似项只作为 conflict，不阻止 apply；
- 不做 embedding/vector duplicate table，不自动删除已有 examples；
- 返回 created/skipped。

## Future Admin LLM Use Cases

同一套能力层未来可扩展到：

- **Skill package assistant**：根据需求生成 `SKILL.md` 草案、修复 validation issue、总结 extra files。
- **Routing debugger**：解释某条 message 为什么命中/未命中 skill，建议 routing example 或 description 修改。
- **Run summarizer**：从 run/tool calls/evaluation 生成问题摘要和下一步修复建议。
- **Schedule assistant**：把自然语言计划转换成 schedule draft，但 apply 前必须人工确认。
- **Personal model curator**：从 sources/runs 提议 claim/evidence/understanding gap，但删除、do_not_use、低置信更新必须人工确认。
- **Release/checklist assistant**：根据当前 deployment/readiness 生成上线检查结果和缺口。

这些场景的共同点是生成 typed draft，不直接执行高影响操作。

## Implementation Plan

### Phase 1: UI Restructure Only

- 重构 `SkillsPage`：把详情区拆成 `SkillDetailHeader`、`SkillPackageEditor`、`SkillRoutingPanel`、`SkillTestPanel`。
- 将当前 Intents UI 重命名并移入 `Routing > Examples` 子面板。
- raw JSON 改成 summary + expandable debug。
- 不改数据模型，不引入 LLM。

验收：

- 现有 create/save/publish/enable/delete/test-run/routing examples CRUD 行为不变。
- `pnpm check`、`pnpm test` 或当前仓库等价验证通过。

### Phase 2: Admin LLM Assist Foundation

- 新增 shared schemas：assist request/response、skill routing example draft。
- 新增 worker service：`adminLlmAssist` + capability registry。
- 新增 `POST /api/admin/skills/:id/routing-examples/generate`，内部调用 `adminLlmAssist.run`。
- 新增 Assist Run persistence，记录 draft、user action、无效输出和未应用状态。
- 增加单元测试：LLM 未配置、无效 JSON、schema parse failure、retry、成功 draft。

验收：

- LLM 未配置时 UI 明确显示 disabled/missing。
- mock LLM 返回 valid draft 时 API 产出 typed response。
- mock LLM 返回 bad output 时不写库，只返回错误或 warnings。

### Phase 3: Skill Routing Examples Generate and Review

- 在 `Routing > Examples` 加 Generate side panel。
- 实现 draft review、编辑、选择、apply selected。
- 新增批量 create endpoint。
- assist run 记录 applied/rejected/edited。
- 不创建 `approval_requests`；owner 在 Admin 中点击 `Apply selected` 即为确认。

验收：

- 生成的 routing examples 不会自动写库。
- 用户 apply 后才写入。
- apply 后 examples 立即影响 semantic routing，但 Skill published version 不变。
- 重复项被 skipped，并在 UI 显示原因。
- owner 编辑 draft 后如果变成 normalized exact duplicate，apply 时仍会 skipped。
- route decision few-shot 能读取新 routing examples，并记录使用到的 example ids 或 example snapshot。

### Phase 4: Routing Quality Loop

- 在 Routing panel 显示最近 near-miss / low-confidence route decisions。
- Generate 支持 “from failed/uncertain routes”。
- 为每个 routing example 记录来源：manual / llm_generated / route_history。若暂不扩表，可先记录在 assist run，后续再扩 `skill_intents`。

验收：

- 能从真实失败样本生成补充 routing examples。
- route decision 页面能解释 routing examples 对候选 skill 的影响。

## Risks and Guardrails

- **Prompt injection**：`SKILL.md`、route history、runs 都按 untrusted context 处理，不允许其中内容覆盖系统指令。
- **Insecure output handling**：所有 LLM 输出先过 Zod schema，再进入 UI draft；写库前二次校验。
- **Excessive agency**：LLM assist 不直接调用 delete/publish/enable 等高影响动作。
- **Cost/latency**：首版非 streaming；生成数量限制；上下文截断；记录 prompt version 方便优化。
- **Data drift**：routing example 不能再以 skill name 作为 canonical relation；目标模型使用 `skillId` 绑定稳定 Skill，并保留 `skillNameSnapshot` 用于审计。Skill rename 或 publish 后 UI 应提示 examples 需要 review，而不是让旧 examples 失联。
- **Model portability**：当前 OpenAI-compatible client 可能不支持 strict schema；内部保留 parse/retry fallback，但 capability schema 不随 provider 改。

## Recommendation

先做 Phase 1 和 Phase 2。不要先做一个直接生成并写入 `skill_intents` 的按钮。交互层先重构出 `Routing > Examples` 的子面板，后端先抽 `adminLlmAssist`，然后让 `skill_routing_examples.generate` 作为第一个 capability 接入。

这样后续 LLM 进入 Admin 的其他页面时，可以复用同一套安全边界、审计记录、schema 输出和 review/apply 交互，而不是积累一批不可治理的临时接口。
