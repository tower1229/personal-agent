# PRD: Agent Skill Protocol Migration

## Problem Statement

Personal Agent currently has a useful skill system, but it is not compatible with the open Agent Skills format. The current system stores a D1-backed chat skill manifest, routes by explicit id or trigger phrase, and executes the manifest instructions through the LLM agent. This works for simple in-product skills, but it is now the wrong abstraction and should be replaced, not preserved as a parallel implementation. It blocks three future needs:

- Reusing skills from the broader Agent Skills ecosystem.
- Authoring skills as portable, version-controlled packages.
- Loading skill instructions progressively instead of treating every skill as an in-product chat prompt.

The external Agent Skills standard defines a skill as a directory with a required `SKILL.md`, YAML frontmatter, Markdown instructions, optional `scripts/`, `references/`, and `assets/`, and progressive disclosure across metadata, instructions, and resources. Popular implementations follow this shape: they index only metadata for discovery, then load `SKILL.md` and referenced resources only when activated.

## Solution

Replace the current non-standard chat skill implementation with a standard Agent Skills package model. The product should support one runtime skill protocol: imported or authored package snapshots that follow the `SKILL.md` directory protocol.

The core design is to make `SkillPackage` the protocol boundary. A package has metadata, `SKILL.md` body, optional files, validation status, source provenance, and a published version. Runtime routing can discover skills from metadata, activate a selected package by loading the `SKILL.md` body, and then load referenced files on demand.

The first production version should not execute arbitrary bundled scripts in the Worker. Scripts may be stored, listed, validated, and referenced, but execution should remain out of scope until a separate sandbox policy exists. This keeps the Cloudflare-only runtime safe and avoids inventing a local script runner inside Workers.

Migration compatibility is allowed only as a bounded data-conversion step. The target architecture must remove the old chat skill manifest runtime branch, old Admin editing model, and old API contracts instead of keeping `chat` and `agent-skill` as long-term parallel kinds.

## User Stories

1. As the owner, I want to import a standard Agent Skill package, so that I can reuse skills written for the broader ecosystem.
2. As the owner, I want Personal Agent to validate `SKILL.md`, so that invalid skills fail before they can affect routing.
3. As the owner, I want standard skills to appear in Admin, so that I can inspect, enable, disable, publish, and delete them.
4. As the owner, I want existing chat skill data to be converted into standard `SKILL.md` packages, so that the migration is clean without losing useful instructions.
5. As the owner, I want a standard skill to be triggered from Telegram, so that I can use portable skills in the same natural-language entrypoint.
6. As the owner, I want the router to use skill name and description for discovery, so that skills are activated by intent rather than only explicit commands.
7. As the owner, I want explicit `/skill <name>` invocation, where `name` comes from `SKILL.md` frontmatter, so that I can force a specific skill when routing is uncertain.
8. As the owner, I want semantic routing to use standard package `name/description`, so that natural-language activation works without preserving old trigger phrase routing.
9. As the owner, I want skill route decisions to record candidates, confidence, and reasons, so that I can debug why a skill was or was not selected.
10. As the owner, I want the agent to load only metadata at discovery time, so that many skills do not flood the prompt.
11. As the owner, I want the full `SKILL.md` body loaded only after activation, so that token usage stays controlled.
12. As the owner, I want referenced files loaded only when the skill body calls for them, so that large references do not enter context unnecessarily.
13. As the owner, I want Admin to show validation errors, so that I can fix malformed frontmatter or naming mismatches.
14. As the owner, I want Admin to show package files, so that I can verify what references and assets a skill includes.
15. As the owner, I want to see source provenance, so that I know whether a skill came from manual upload, repo import, or Admin authoring.
16. As the owner, I want each published package version to be immutable, so that previous runs remain auditable.
17. As the owner, I want skill runs to link to the exact skill version, so that I can reproduce or explain historical behavior.
18. As the owner, I want unsupported script execution to be explicit, so that the agent does not silently pretend scripts can run in Workers.
19. As the owner, I want allowed tool metadata to map into current built-in tool allowlists where possible, so that standard skills can still respect product risk boundaries.
20. As the owner, I want unknown or unsupported allowed tools to be surfaced as warnings, so that I can decide whether to edit the skill or extend the runtime.
21. As the owner, I want a migration path from legacy chat skills to standard `SKILL.md`, so that existing skills become portable and the old model can be removed.
22. As the owner, I want the old chat skill API, schema, and Admin editor removed after migration, so that there is one clean skill implementation.
23. As the owner, I want a standard skill test-run flow, so that I can validate a package before enabling it for Telegram.
24. As the owner, I want package validation to be deterministic and unit-tested, so that skill acceptance does not depend on model output.
25. As the owner, I want a clean boundary between protocol parsing and runtime execution, so that future protocol changes do not ripple through the bot.
26. As the owner, I want the product to store package snapshots, so that runtime does not depend on live network fetches.
27. As the owner, I want future GitHub import support, so that I can pull skills from public or private repos after explicit authorization.
28. As the owner, I want package assets to be stored without entering the LLM context by default, so that templates and large files remain available but cheap.
29. As the owner, I want route conflicts to be visible, so that two similar skill descriptions do not create unpredictable behavior.
30. As the owner, I want standard skills to remain single-owner scoped, so that no other Telegram user can activate or modify them.

## Implementation Decisions

- Build a deep `SkillPackageParser` module that accepts a package file map and returns frontmatter, Markdown body, normalized metadata, and file inventory.
- Build a deep `SkillPackageValidator` module that enforces the Agent Skills protocol:
  - required `SKILL.md`;
  - required `name` and `description`;
  - name length, character, hyphen, and directory-name matching rules;
  - description length and non-empty semantics;
  - optional `license`, `compatibility`, `metadata`, and experimental `allowed-tools`;
  - optional `scripts/`, `references/`, and `assets/` inventory.
- Use a small in-runtime parser for frontmatter and validation. The official reference validator can remain the external comparison target, but Worker runtime should not shell out to Python or rely on local filesystem tools.
- Replace the existing chat manifest domain model with a `SkillPackage` domain model. This model should preserve raw `SKILL.md`, parsed metadata, validation status, source type, source URI, file inventory, and package content hash.
- Preserve the useful versioning behavior, but migrate storage semantics to standard package versions that are immutable once published.
- Add a one-time migration adapter that converts legacy chat skill records into standard package drafts or published versions. Do not keep this adapter in the runtime activation path.
- Add a standard package activation path:
  - discovery loads only name and description;
  - activation loads `SKILL.md` body;
  - referenced resources are exposed through explicit read-by-path operations, not automatically injected.
- Keep bundled script execution out of scope for the first version. Store and display `scripts/`, but do not run them from Worker.
- Map standard `allowed-tools` into existing built-in tool allowlists only when a token has a known local equivalent. Unknown tool tokens become validation warnings, not hard failures.
- Preserve `/skill <name>` explicit invocation for standard skills; internal database ids are not Telegram trigger identifiers.
- Remove trigger phrase matching; treat standard skill `name/description` as the route-discovery input.
- Extend route decision records to support multiple candidates, normalized confidence, and protocol kind, while preserving existing route trace pages.
- Update Admin skill inventory to remove the `chat` kind and present standard Agent Skills as the only skill kind.
- Add Admin import flow for standard packages. First version can accept pasted `SKILL.md` plus optional file inventory or a packaged upload if feasible in the current Admin stack.
- Add Admin validation display before publish. Users should be able to save invalid drafts but not publish invalid package versions.
- Store package files as content-addressed records or version-scoped records. For small personal-agent packages, D1 can store text files initially; large assets should be reserved for later R2 storage.
- Do not introduce MCP as the skill protocol itself. MCP can remain a future tool/runtime integration layer, while Agent Skills remain the knowledge/workflow package format.
- Do not let standard skills bypass existing owner auth, tool risk, approval, or Telegram webhook controls.

## Testing Decisions

- Tests should assert external behavior: accepted packages, rejected packages, routing outcomes, activation context, tool allowlist behavior, Admin API responses, and Telegram-visible outputs.
- Parser tests:
  - accepts a minimal valid `SKILL.md`;
  - accepts optional fields;
  - preserves Markdown body;
  - indexes scripts, references, and assets;
  - rejects missing frontmatter and missing required fields.
- Validator tests:
  - enforces name rules and directory-name matching;
  - enforces description length and presence;
  - warns on unsupported allowed tool tokens;
  - keeps unsupported script execution as a warning or capability flag, not a runtime execution path.
- Repository tests:
  - saves standard package drafts;
  - publishes immutable package versions;
  - lists enabled package metadata for discovery;
  - links skill runs to exact package versions.
- Router tests:
  - explicit `/skill <name>` works for standard packages;
  - semantic routing can match by package `name/description`;
  - disabled or invalid packages are not routed;
  - route decisions include candidate metadata and reason.
- Runtime tests:
  - activated standard skill loads `SKILL.md` body into the agent prompt;
  - package references are not automatically injected;
  - allowed tools are constrained by mapped allowlist;
  - unknown tools cannot be invoked.
- Admin API tests:
  - create/import standard package draft;
  - validate draft;
  - publish only valid package;
  - test-run package;
  - show validation errors in responses.
- Regression tests should reuse existing skill lifecycle and routing test style while updating expected behavior to the standard package model.

## Out of Scope

- Preserving the old non-standard chat skill runtime implementation.
- Executing bundled scripts from standard skill packages.
- Full marketplace or registry integration.
- Live remote GitHub import without an explicit later auth/design pass.
- Multi-owner or team skill sharing.
- MCP server installation or dynamic MCP tool loading.
- R2-backed large asset storage unless D1 size limits become a blocker.
- Semantic routing improvements beyond what is needed to activate standard skill metadata. Full LLM routing remains a separate roadmap item.
- Rewriting long task planning as a standard skill.

## Further Notes

- External standards evidence:
  - Agent Skills requires a directory with `SKILL.md` at minimum.
  - `SKILL.md` requires YAML frontmatter and Markdown body.
  - `name` and `description` are required.
  - `scripts/`, `references/`, and `assets/` are optional.
  - Progressive disclosure is central: metadata at startup, body on activation, resources on demand.
- Current implementation evidence:
  - Personal Agent currently stores skill drafts and versions as JSON manifests in D1.
  - Current legacy routing is explicit id or trigger phrase, then command/LLM fallback.
  - Current skill execution uses manifest instructions as LLM system instructions.
- Recommended migration shape:
  1. Add parser and validator with unit tests.
  2. Replace the legacy manifest model with package model and D1 persistence.
  3. Add Admin import/validation/publish.
  4. Add runtime activation for standard packages.
  5. Convert existing legacy skill rows to standard package records.
  6. Remove legacy chat skill schema, API, Admin form, and runtime branches.
  7. Later, revisit script execution with a real sandbox policy.
