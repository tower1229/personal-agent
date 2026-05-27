# Learning Notes

This project is now focused on Cloudflare-native agent engineering.

## Current Learning Targets

- Worker request routing and webhook security.
- Telegram Login verification and owner-only sessions.
- D1 repository design with explicit prepared statements.
- Shared schema contracts across Worker and React Admin.
- Automatic long-task planning, bounded execution, Cron continuation, and Admin step tracing.
- Dynamic schedules with one Cron Trigger and D1 idempotency.
- LLM tool calling without provider SDK lock-in.
- Admin UX for traces, skills, schedules, and diagnostics.

## Engineering Principles

- Keep public API stable while refactoring internals.
- Keep shared schemas runtime-agnostic.
- Keep external secrets out of Admin responses.
- Record tool calls and error summaries for every non-trivial action.
- Prefer small, typed boundaries over implicit cross-module coupling.
