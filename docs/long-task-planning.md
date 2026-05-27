# Long Task Planning

## Goal

Add an agent-level long-task mode that automatically handles complex user requests by planning first, then executing tracked steps with progress, evidence, and recovery.

This replaces the removed workflow skill system. The old workflow model was a manually-authored static step list. The target model is dynamic: the agent decides when a request needs long-task handling, creates a plan, persists it, executes incrementally, and can revise the plan when observations change.

## Non-Goals

- Do not reintroduce Cloudflare Workflows as the primary abstraction.
- Do not expose arbitrary JS/TS execution from Admin.
- Do not require the user to manually choose a workflow skill for normal complex requests.
- Do not hide long-running state only inside provider/runtime internals; D1 remains the source of trace truth.

## User Experience

Telegram remains the natural-language entrypoint.

For simple tasks:

```text
message -> normal command / chat skill / LLM agent -> reply
```

For complex tasks:

```text
message
  -> complexity classifier
  -> create long_task + plan
  -> send concise plan summary
  -> execute step by step
  -> send progress only at meaningful checkpoints
  -> final answer with result, evidence, and remaining risks
```

The user should be able to say:

- `继续` to resume a paused/running long task.
- `暂停 <task>` to pause.
- `取消 <task>` to cancel.
- `状态 <task>` to see current plan, completed steps, and blockers.

## Data Model

Add new D1 tables:

```text
long_tasks
  id
  owner_tg_user_id
  run_id
  title
  original_input
  status: planning | running | waiting_for_user | paused | succeeded | failed | cancelled
  complexity_score
  planner_reason
  current_step_id
  output_text
  error
  created_at
  updated_at

long_task_steps
  id
  long_task_id
  position
  title
  description
  status: pending | running | succeeded | failed | skipped | blocked
  tool_policy
  input_json
  output_json
  error
  started_at
  completed_at
  created_at

long_task_events
  id
  long_task_id
  step_id nullable
  event_type
  payload_json
  created_at
```

Keep normal `runs` and `tool_calls`; link tool calls to the originating run and optionally record `long_task_id` later if trace filtering needs it.

## Complexity Classifier

Add a small routing phase before normal LLM fallback. It should return structured JSON:

```json
{
  "mode": "simple|long_task",
  "score": 0.0,
  "reason": "...",
  "needsUserConfirmation": false
}
```

Initial heuristic gates before LLM classification:

- Long task if request asks for multi-source research, comparison, report, planning, code changes plus verification, monitoring, or multi-step execution.
- Simple if it maps cleanly to one deterministic command or one short chat answer.
- Ask confirmation only when the task is high-risk, destructive, expensive, or ambiguous.

## Planner

Planner input:

- original user message
- available tools
- relevant memories
- skill match, if any
- risk policy

Planner output:

```json
{
  "title": "...",
  "steps": [
    {
      "title": "...",
      "description": "...",
      "toolPolicy": "none|read|write_low|external_send|destructive",
      "successCriteria": "..."
    }
  ],
  "userConfirmationRequired": false,
  "confirmationQuestion": null
}
```

Planner rules:

- Make steps small enough to verify.
- Include explicit evidence-gathering steps for research.
- Include verification steps for code/config changes.
- Avoid planning implementation details into user-facing docs unless the user requested a plan document.

## Executor

Execution should be a bounded loop over persisted `long_task_steps`.

Per step:

1. Mark step running.
2. Build a step-specific prompt with current task context and prior outputs.
3. Allow only tools permitted by the step `toolPolicy`.
4. Record tool calls and step output.
5. Decide whether to continue, replan, ask user, or fail.

Important limits:

- `MAX_LONG_TASK_STEPS`, default 12.
- `MAX_REPLAN_COUNT`, default 2.
- `MAX_STEP_TOOL_ROUNDS`, default same as current `LLM_MAX_TOOL_ROUNDS`.
- Each Worker invocation should do limited work; for longer continuation use Cron polling or Queue-based continuation.

## Runtime Strategy

Start with D1 + Cron continuation because the app already has a minute Cron Trigger.

Phase 1:

- Execute short long-tasks inline when expected to finish within one Worker request.
- Persist state before each step.
- Cron resumes `running` tasks whose `updated_at` is stale and have pending steps.

Phase 2:

- Add Cloudflare Queues if step continuation needs faster or more reliable background execution.
- Keep Cloudflare Workflows out unless there is a concrete platform need that D1 + Queue cannot satisfy.

## Admin

Add a Long Tasks page:

- list tasks by status and updated time
- detail page with plan, step timeline, events, tool calls, and final output
- actions: pause, resume, cancel
- show classifier reason and complexity score

Run detail should link to the long task if the originating run created one.

## Implementation Phases

1. Schema and repositories
   - Add shared DTOs for long task summaries/details.
   - Add D1 migration for `long_tasks`, `long_task_steps`, `long_task_events`.
   - Add repository methods and fake repository support.

2. Classifier and planner
   - Add `classifyTaskComplexity`.
   - Add `createLongTaskPlan`.
   - Persist planning trace.
   - Tests for simple vs long-task routing.

3. Executor
   - Add bounded step executor.
   - Reuse existing tool allowlist/risk model.
   - Record step events and final output.
   - Tests for success, step failure, tool block, and replan.

4. Telegram controls
   - Add `状态`, `继续`, `暂停`, `取消`.
   - Send concise plan summary and final result.

5. Admin
   - Add Long Tasks route and dashboard metric.
   - Add run detail linkage.

6. Background continuation
   - Add Cron resume for stale running tasks.
   - Add idempotency guard so a task step cannot run twice concurrently.

## Acceptance Criteria

- A complex request automatically creates a long task without requiring `/skill`.
- The first reply shows a short plan summary.
- Each step is persisted with status and output.
- A failed step leaves a useful error and task status.
- The user can pause, resume, cancel, and query status from Telegram.
- Admin can inspect task plan, events, tool calls, and final output.
- Existing simple commands and chat skills still use the normal fast path.
