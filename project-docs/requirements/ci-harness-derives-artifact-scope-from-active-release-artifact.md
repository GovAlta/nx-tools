---
title: CI harness derives artifact scope from active release artifact
id: req-014
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:release-scope]
resolves: []
rules:
  - id: rule-1
    title: task-identification filters signals to features named in active releases
    examples:
      - "Given at least one non-archived `project-docs/releases/<slug>.md` exists whose `project-docs-ancestors` includes `features:X`, When the task-identification script runs with no explicit `artifact_scope` input, Then only signals whose artifact is, or descends from, `features:X` (and any other features named across all active releases) are eligible"
      - "Given two active releases reference features A and B respectively, When task-identification runs, Then signals from both A and B subtrees are eligible (union of release ancestors)"
    questions: []
  - id: rule-2
    title: absence of release artifacts falls back to existing artifact_scope behavior
    examples:
      - "Given no `project-docs/releases/` files exist, When task-identification runs with `artifact_scope` empty, Then behavior is unchanged — scope is open (full backlog eligible)"
      - "Given no release files exist, When task-identification runs with `artifact_scope` set to a specific path, Then behavior is unchanged — that explicit scope is used"
    questions: []
  - id: rule-3
    title: explicit artifact_scope input takes precedence over release-derived scope
    examples:
      - "Given an active release artifact exists AND the workflow dispatch sets a non-empty `artifact_scope`, When task-identification runs, Then the explicit `artifact_scope` is used and the release-derived scope is ignored"
    questions: []
  - id: rule-4
    title: task-identification logs which releases are active when scope is release-derived
    examples:
      - "Given scope was derived from release artifacts, When task-identification completes its scope resolution, Then it emits a diagnostic line naming each active release file and which features it contributed to the scope"
    questions: []
questions: []
---

## Rationale

The CI harness `artifact_scope` input is a manual per-dispatch parameter: whoever triggers the
workflow must remember to set it correctly. Without it, the harness treats the entire backlog as
in-scope. Release artifacts (req-013) record the intended scope durably in the repo — but only
matter if the harness actually reads and respects them automatically.

This requirement closes that gap: the task-identification script reads active (non-archived)
release artifacts and derives the eligible signal set from their `project-docs-ancestors` directly,
making the release file the durable, reviewed record of scope rather than a per-dispatch input.
Explicit `artifact_scope` input still overrides when set, preserving the existing escape hatch for
targeted investigations.
