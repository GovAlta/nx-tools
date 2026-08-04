---
title: "develop skill: implementation plan commitment"
project-docs-ancestors: [domain-models:develop-skill-commitment-pattern]
---

The develop skill text is the contract this design specifies. The consumer is the agent reading
step 1 and the independent review section. Both interface points below trace to the three rules
in the requirement.

## Interface point 1: step 1 — lineage read commitment

**Traces to**: req-001 rule 1 — "step 1 requires a stated implementation plan before any code is
written"

**File**: `packages/nx-agent/src/generators/agent-delivery/files/skills/develop/SKILL.md`
(also `.claude/skills/develop/SKILL.md` in this workspace)

After the current sentence ending "...a sibling resource may have already implemented shared logic
this pass should reuse.", append the following sentence block:

```
Before moving on, state your implementation plan in one short block: which sibling resources you
found and will reuse, what you are implementing fresh, and which domain invariants belong in the
service vs. orchestration layer. This makes the lineage read a commitment, not a note.
```

No step is added. No renumbering. The new text is appended to the existing step 1 paragraph.

## Interface point 2: independent review — plan as reviewer input

**Traces to**: req-001 rule 2 — "the independent review receives the implementation plan alongside
code and design artifacts"; req-001 rule 3 — "the independent reviewer's first question checks
whether the diff matches the stated plan"

In the `### Independent code review — every pass` section, change the opening sentence from:

> Give the reviewer only the api-design/ux-design, the
> domain terms it should be consistent with, and the new/changed code — never this pass's own
> reasoning.

to:

> Give the reviewer the api-design/ux-design, the domain terms it should be consistent with, the
> implementation plan from step 1, and the new/changed code — never this pass's own reasoning.

And prepend one question to the reviewer's list (before "does the code use a term
inconsistently..."):

```
Does the code match what the plan said it would reuse and build fresh?
```
