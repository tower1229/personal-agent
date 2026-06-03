# Personal Agent

Personal Agent is a single-owner assistant system with a Telegram conversation surface and an Admin management surface. This glossary keeps the product language precise when AI capabilities participate in system management.

## Language

**Admin LLM Assist**:
An Admin-side AI assistance capability that produces a reviewable management draft, diagnosis, or recommendation for the owner. It is separate from the Telegram-facing **LLM Agent**.
_Avoid_: admin agent, backend chatbot, direct admin automation

**LLM Agent**:
The Telegram-facing conversational agent that responds to owner messages and may use approved runtime tools. It is not the same concept as **Admin LLM Assist**.
_Avoid_: Admin LLM Assist, admin copilot

**Typed Draft**:
A structured proposal produced for owner review before it affects managed system state. A typed draft may be edited, accepted, rejected, or applied by the owner.
_Avoid_: direct write, automatic mutation, final action

**Skill Routing Example**:
An owner-maintained natural language example that helps semantic routing decide when a specific Skill should be considered. It belongs to a stable **Skill**, not to a Skill package version or a skill name string.
_Avoid_: intent, trigger phrase, NLU label

**Routing Overlay**:
Active routing guidance that can affect semantic Skill routing without changing a published Skill package version. **Skill Routing Examples** are routing overlay, not package content.
_Avoid_: package draft, hidden publish, version mutation

**Assist Run**:
An audit record for one Admin LLM Assist generation attempt and the owner's handling of its typed draft. It is distinct from a Telegram-facing runtime run and from an approval request.
_Avoid_: run, approval, chat trace

**Owner Apply**:
An explicit Admin UI action where the owner accepts selected parts of a typed draft and writes them to managed system state. Owner Apply is sufficient for low- and medium-risk Admin LLM Assist outcomes such as Skill Routing Examples.
_Avoid_: approval request, automatic apply, background mutation

**Approval Request**:
An extra confirmation record for high-risk actions that should not execute from an ordinary draft review alone. It is not required for applying Skill Routing Examples.
_Avoid_: review click, typed draft, Assist Run

**Admin LLM Capability**:
A named Admin LLM Assist behavior with a typed target, typed input options, and a typed draft output. Capabilities may share an internal service while exposing narrow Admin API endpoints.
_Avoid_: arbitrary prompt endpoint, generic admin chat command

**Conflict Context**:
A bounded set of related Skills supplied to Admin LLM Assist so it can detect likely routing overlap. It is not the full Skill inventory and should not include unrelated Skill package contents.
_Avoid_: all skills context, full package dump, global prompt context

**Skill Routing Profile**:
A compact, routing-focused description of a Skill used by semantic routing or Admin LLM Assist. It summarizes when the Skill should be considered without exposing the full Skill package content.
_Avoid_: full SKILL.md, package dump, execution instructions

**Derived Profile**:
A non-owned snapshot computed from current source data for a specific decision or Assist Run. It is not a separately managed domain object.
_Avoid_: cached profile record, editable profile, hidden source of truth

**Routing Example Language**:
The natural language style used in Skill Routing Examples to match how the owner actually asks for work in Telegram. The default is Chinese conversational phrasing unless the owner chooses another mode.
_Avoid_: package language, automatic language inference, literal translation set

**Routing Example Cluster**:
A temporary review grouping for generated Skill Routing Examples that describe the same kind of owner request. It helps the owner judge coverage during review and is not persisted as a long-lived routing object.
_Avoid_: intent cluster, persistent category, routing taxonomy

**Routing Example Duplicate**:
A Skill Routing Example that normalizes to the same text as another example for the same Skill. Near-duplicates may be flagged during review, but only normalized exact duplicates are hard-skipped in the first version.
_Avoid_: embedding duplicate, automatic merge, cross-skill duplicate ban

## Example Dialogue

Developer: Should this generated list of skill routing phrases be created by the LLM Agent?

Domain expert: No. It belongs to Admin LLM Assist because it is a management draft for the owner to review before applying.

Developer: Are these examples stored inside SKILL.md?

Domain expert: No. Skill Routing Examples guide routing outside the package; SKILL.md remains the Skill package definition.

Developer: If the Skill is renamed, do the routing examples move to the new name?

Domain expert: They stay attached to the same Skill. The old name may be kept as audit context, but it is not the relationship.

Developer: If I apply new Skill Routing Examples, did I publish a new Skill version?

Domain expert: No. The examples become active routing overlay; the Skill package version is unchanged.

Developer: Should a generated draft appear in the same run history as Telegram messages?

Domain expert: No. It belongs to an Assist Run because it is Admin-side management assistance, not a Telegram conversation run.

Developer: Do generated Skill Routing Examples need an approval request after I review and apply them?

Domain expert: No. Owner Apply is the confirmation for that routing overlay change; approval requests are reserved for higher-risk actions.

Developer: Should the first HTTP API be a generic assist endpoint?

Domain expert: No. Expose a narrow Skill Routing Examples generate endpoint first, while implementing it through an internal Admin LLM Capability service.

Developer: Should generating examples for one Skill include every other Skill?

Domain expert: No. Include only bounded Conflict Context for the few Skills most likely to overlap in routing.

Developer: Should generated routing examples receive the full SKILL.md body?

Domain expert: No. Use a Skill Routing Profile that contains only routing-relevant metadata and snippets.

Developer: Should the Skill Routing Profile be stored as its own editable record?

Domain expert: No. Compute it deterministically when needed and store only the Assist Run context snapshot for audit.

Developer: If a Skill package is written in English, should its routing examples default to English?

Domain expert: No. Default to Chinese conversational examples because routing should match the owner's Telegram input style.

Developer: Should generated routing examples be grouped by request type?

Domain expert: Yes, group them temporarily during review as Routing Example Clusters, but only persist the selected examples.

Developer: Should near-duplicate routing examples be blocked automatically?

Domain expert: No. Block normalized exact duplicates for the same Skill; show near-duplicates as review warnings.
