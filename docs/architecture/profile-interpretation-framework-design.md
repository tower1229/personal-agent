# Profile Interpretation Framework Design

## Purpose

`/admin/profile` is the owner's low-friction disclosure surface. The owner should only need to state facts such as MBTI, enneagram, astrology sign, or other self-interpretation labels. The system, not the owner, is responsible for turning those disclosures into governed Personal Model material.

This design covers the bridge from shallow Profile fields to deep Personal Model interpretation.

## Current Problem

The Profile page currently stores `interpretationFramework` as JSON:

```json
{
  "mbti": "INTJ",
  "enneagram": "5w4",
  "astrologySign": "Aquarius"
}
```

The field is persisted, but the runtime does not consume it. That creates a misleading configuration: the owner can disclose meaningful self-knowledge, but the agent does not yet use it as evidence, context, or interpretation.

The opposite fix would also be wrong: directly injecting `interpretationFramework` into the prompt would flatten an evidence-aware Personal Model into static profile labels. MBTI, enneagram, astrology, and similar frameworks are not identity truths. They are interpretation frameworks that can support, challenge, or calibrate claims when combined with behavior, self-report, and historical evidence.

## Product Principle

Profile disclosure and Personal Model interpretation are separate responsibilities:

- Profile captures what the owner says about themself.
- Personal Model decides how that information is represented, weighted, audited, and used.
- Runtime context uses only the governed Personal Model representation, not raw Profile JSON, except for basic biographical facts already handled by profile context.

The owner experience should stay simple. The owner edits Profile fields. The system silently materializes and maintains the corresponding Personal Model source and claims.

## Domain Mapping

Profile `interpretationFramework` maps to:

- `source_documents.source_type = "personality_framework"`
- `personal_model_claims.layer = "interpretation_framework"`
- `personal_model_claims.scenario = "self_knowledge"` by default
- `personal_model_evidence.evidence_type = "manual_confirmation"` for direct owner disclosure
- `personal_model_evidence.evidence_type = "framework_consistency"` only when another claim is being supported by a framework match

The Profile row remains the editable source-of-disclosure. The Personal Model rows are the interpreted, governed representation.

## Data Contract

Profile should store only normalized disclosure fields:

```ts
type ProfileInterpretationFramework = {
  mbti?: string;
  enneagram?: string;
  astrologySign?: string;
  notes?: string;
  updatedAt?: number;
};
```

Future framework details belong in Personal Model source metadata, not as more top-level Profile columns. Examples:

- `frameworkType`: `mbti`, `enneagram`, `astrology`, `self_narrative`
- `testDate`
- `agreementLevel`
- `stableDimensions`
- `unstableDimensions`
- `ownerNotes`

## Materialization Flow

When `/api/admin/profile` creates or updates `interpretationFramework`, the Worker should call a focused service:

```ts
syncProfileInterpretationFramework({
  repositories,
  ownerTgUserId,
  profile,
  previousProfile,
  now,
  generateId
});
```

The service is responsible for:

1. Parse and normalize the Profile JSON.
2. Create or update one canonical `personality_framework` source document with deterministic metadata:
   - title: `Profile Interpretation Framework`
   - content: human-readable Markdown assembled from the disclosed fields
   - usagePolicy: `use_only_if_relevant`
   - sensitivity: `medium`
   - metadata: `{ source: "profile", profileField: "interpretationFramework", version: 1 }`
3. Create or update low-risk direct disclosure claims:
   - `用户自述 MBTI 为 INTJ。`
   - `用户自述九型人格为 5w4。`
   - `用户自述星座为 Aquarius。`
4. Attach `manual_confirmation` evidence from the canonical source or source chunk.
5. Mark claims as `active`, `confidence = "high"` only for the narrow fact that the owner disclosed the label.
6. Never create deep inferred claims such as "用户在压力下会 X" from the label alone.

Deep claims require later interpretation work with evidence from behavior, conversation, writings, or explicit interview answers.

## Claim Semantics

The materialized claims must be phrased as disclosure facts, not psychological conclusions.

Allowed:

- `用户自述 MBTI 为 INTJ。`
- `用户自述九型人格为 5w4。`
- `用户自述星座为 Aquarius。`
- `用户认为 MBTI 对自我理解有一定解释力。`

Not allowed:

- `用户是典型 INTJ，因此不喜欢情绪化沟通。`
- `用户星座说明其关系模式是 X。`
- `用户应按 MBTI 建议做职业决策。`

Frameworks may raise or lower confidence in another claim only as secondary evidence. They must never override current explicit expression or observed behavior.

## Runtime Use

`assemblePersonalModelContext` may include `interpretation_framework` claims only under these rules:

- Include them primarily in `self_knowledge`, `emotional_support`, `relationship`, `writing`, and `life_decision` scenarios.
- Exclude them from technical and operational scenarios unless the user explicitly asks about self-knowledge, communication style, or personal decision framing.
- Keep `usagePolicy = "use_only_if_relevant"` for profile-derived framework claims.
- Render them under a separate label such as `Interpretation frameworks`, not mixed into stable facts.
- Add a fixed system instruction: interpretation frameworks are auxiliary calibration signals and must not override direct evidence.

The runtime should continue to log `used_in_response` and `excluded_by_policy` events for these claims, as it already does for selected Personal Model claims.

## UI Design

`/admin/profile` should keep the three simple fields:

- MBTI
- Enneagram
- Astrology Sign

These fields should be option-based controls, not free-text inputs. Accuracy matters because these values become Personal Model evidence. The UI should provide explicit choices and store normalized values:

- MBTI: the 16 standard MBTI types, plus an empty/unknown state.
- Enneagram: standard enneagram type or wing options, plus an empty/unknown state.
- Astrology Sign: the 12 zodiac signs, plus an empty/unknown state.

If the owner needs nuance beyond the predefined value, use the optional notes field rather than overloading the normalized value.

It may later add a single free-text `Notes` field for "how much do you identify with these frameworks / what should the agent not assume".

`/admin/profile` should not expose Personal Model mechanics. It should not ask the owner to choose layer, scenario, confidence, evidence type, or usage policy.

`/admin/personal-model` remains the audit and correction surface. The canonical materialized source and claims should be visible there with metadata showing they came from Profile.

## Update And Deletion Semantics

Profile changes should be treated as owner corrections:

- If a field changes, update the canonical source content and deprecate the old disclosure claim.
- Create a new active claim for the new disclosure.
- Record a `corrected` event on the old claim and a `created` or `confirmed` event on the new claim.
- If a field is cleared, deprecate the corresponding claim and keep historical events for audit.

Do not delete old claims by default. Deletion should remain an explicit Admin Personal Model action.

## Background Interpretation

The deeper interpretation layer should be a separate capability, not part of Profile save.

Recommended later flow:

1. Profile disclosure creates direct framework source and disclosure claims.
2. Understanding gaps identify missing details, such as "which MBTI dimensions are stable" or "how much does the owner identify with astrology".
3. A focused interview or Admin LLM Assist turns richer answers into source documents.
4. Reflection proposes higher-order claims with evidence:
   - behavior pattern
   - preference
   - value
   - boundary
5. The context assembler uses those governed claims, with framework consistency as secondary evidence.

This prevents one static label from becoming a hidden personality engine.

## Implementation Order

1. Keep the Profile fields.
2. Convert Profile framework fields to option-based controls with normalized values.
3. Add shared schema for `ProfileInterpretationFramework`, including enum validation for normalized values.
4. Add `syncProfileInterpretationFramework` in a focused Worker module, not in `adminSystemRoutes.ts`.
5. Call the service from `/api/admin/profile` after profile upsert.
6. Add repository helpers only if needed to find existing profile-derived framework claims and source documents by metadata.
7. Update `assemblePersonalModelContext` to separate `interpretation_framework` claims and apply scenario policy.
8. Add tests:
   - invalid framework values are rejected or normalized before persistence
   - profile update creates or updates a `personality_framework` source
   - profile update creates narrow disclosure claims
   - changed MBTI deprecates old claim and creates new claim
   - cleared field deprecates corresponding claim
   - runtime includes framework claims for self-knowledge
   - runtime excludes them for unrelated technical requests
   - `do_not_use` and deprecated claims remain excluded

## Non-Goals

- Do not directly inject raw `interpretationFramework` JSON into the LLM prompt.
- Do not make MBTI, enneagram, or astrology required onboarding fields.
- Do not infer deep traits from a label alone.
- Do not create a second editable source of truth outside Profile for these shallow disclosure fields.
- Do not remove auditability from Personal Model.

## Success Criteria

- The owner edits Profile normally and does not need to understand Personal Model internals.
- The Personal Model contains auditable source and claim records derived from Profile.
- Runtime can use framework information when relevant, but only as a calibrated auxiliary signal.
- Admin can inspect, correct, deprecate, or mark the derived claims as `do_not_use`.
- A technical or operational conversation is not polluted by personality framework claims unless relevant.
