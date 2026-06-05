# Development Standards

This document is mandatory project guidance for AI IDEs and coding agents. Follow it before changing code, tests, migrations, or configuration.

## 1. Scope and Evidence

- Read the relevant code, schemas, migrations, tests, and existing docs before editing.
- Keep the change bounded to the requested behavior. Do not preserve old prototypes, stale assumptions, or unrelated plans in product docs.
- Treat explicit product constraints as settled unless current code or documents contradict them.
- When a change is user-facing or contract-facing, update all affected surfaces: shared schema, worker route, repository, UI, tests, and migrations.

## 2. Configuration and Runtime Data

- Runtime-editable product data must live in the database or an explicit configuration store, not in prompt strings or UI constants.
- Agent SOUL, Core Memory, profile fields, skill routing rules, and governance state are owner-scoped data. Do not hardcode them in `apps/worker/src/agent.ts`.
- Agent SOUL has one persisted contract field: `user_profiles.agent_soul` / API `agentSoul`. Do not store or read SOUL from `preferences.soul`, UI defaults, prompt constants, or alternate compatibility fields.
- Admin-editable configuration fields must have a concrete runtime, product, or materialization path. Profile disclosure fields may stay simple for the owner, but they must sync into the owning model or workflow before they can be considered implemented.
- Prompt assembly may label and order data, but the content of editable memory/configuration must come from the repository layer.
- If existing hardcoded data must become persisted data, add a forward migration that seeds current rows once, then remove runtime hardcoding.

## 3. Admin Authentication

- Every `/api/admin/*` route that returns or mutates owner data must call `adminOwnerId(c)` and reject unauthenticated requests with `401`.
- Do not use `ownerId(c.env)` as an Admin authentication check. It only reads the configured owner id and does not verify the request session.
- Public Admin bootstrap endpoints must be explicit exceptions, such as `/api/admin/health`, `/api/admin/auth-config`, and unauthenticated `/api/admin/me` state.
- New Admin route modules need negative auth tests for owner-scoped list, create, update, delete, and LLM-assist actions.

## 4. Module Boundaries and File Size

- New behavior should be placed in the smallest established module that owns it.
- `apps/worker/src/agent.ts` is already a legacy oversized orchestrator. Do not add new feature-specific logic there unless it is only a narrow integration call.
- If a file exceeds 500 lines, adding a new responsibility requires a short justification in the PR or commit notes.
- If a file exceeds 800 lines, new domain logic must be extracted into a focused module before or during the change.
- Avoid "god files" that mix API routing, persistence, prompt construction, tool execution, planning, and UI logic.

## 5. Schema and Migration Rules

- Shared request/response contracts belong in `packages/shared/src/schemas.ts`.
- D1 schema changes must be forward migrations. Do not edit historical migrations to fix deployed schema drift.
- New D1 migration filenames must use the next unique numeric prefix. Do not add another migration with an existing prefix, and do not rename historical migrations that may already be deployed.
- Repository types, D1 row mapping, fake repositories, Admin API handlers, and UI clients must stay consistent with shared schemas.
- For OpenAI tool Zod schemas, never use `z.number().positive()` or `z.number().negative()`. Use explicit `.min()` / `.max()` numeric bounds.

## 6. Testing and Verification

- Add targeted tests for every changed contract or persistence path.
- Prefer narrow regression tests that prove the actual bug or behavior, then run broader checks when risk justifies it.
- If full typecheck or build fails due to known unrelated issues, report the exact failing command and preserve the passing targeted verification.
- Do not declare a change complete from schema validity alone; verify ownership, persistence, prompt injection, and negative cases when relevant.
- `noUnusedLocals` and `noUnusedParameters` are part of the normal TypeScript quality gate. When files are split or moved, remove copied imports, unused context destructuring, and dead helper functions instead of leaving them for later.

## 7. Anti-Patterns

The following are not allowed:

- Hardcoding owner-editable prompt content, memory, SOUL, profile facts, or governance state in runtime code.
- Creating alternate storage paths for the same owner-editable concept, such as storing Agent SOUL in both `agentSoul` and `preferences.soul`.
- Exposing Admin configuration controls that do not affect runtime behavior, any visible product workflow, or a documented materialization pipeline into the owning model.
- Protecting Admin owner-data routes with `ownerId(c.env)` instead of session-backed `adminOwnerId(c)`.
- Adding new responsibilities to `agent.ts` instead of extracting a module.
- Updating only UI while leaving API, schema, repository, migration, or tests inconsistent.
- Editing historical migrations for a database that may already be deployed.
- Weakening a requested product capability into a smaller "first version" without explicit user instruction.
- Leaving old product scope, old prototypes, or stale implementation plans in canonical docs.
- Treating lint/type/import problems as reasons to relax quality gates before attempting automatic or local fixes.
