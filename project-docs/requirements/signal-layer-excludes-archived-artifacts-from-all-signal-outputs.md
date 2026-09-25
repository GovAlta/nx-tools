---
title: signal layer excludes archived artifacts from all signal outputs
id: req-009
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: archived artifacts are excluded from unreferenced, unscoped, and resolution.open computeFindings outputs
    examples:
      - "Given features:foo is archived and has no active descendants pointing to it, when
        computeFindings runs, then features:foo does not appear in the unreferenced list"
      - "Given an archived open-question artifact, when computeFindings runs, then it does not
        appear in resolution.open"
    questions: []
  - rule: integrity findings (broken refs, YAML errors, cycles, schema errors) still apply to archived artifacts
    examples:
      - "Given project-docs/archive/features/foo.md contains malformed YAML frontmatter, when
        project-docs-lineage runs, then a YAML error is reported for that file"
    questions: []
  - rule: task-identification.mjs skips artifacts whose registry entry has archived:true in all signal-emission loops
    examples:
      - "Given features:foo exists at project-docs/archive/features/foo.md with no active
        descendants, when task-identification runs against the lineage registry, then no signal
        is emitted for features:foo"
      - "Given requirements:bar is archived, when task-identification scans for unrefined
        requirements, then requirements:bar is not included in that scan"
    questions: []
questions: []
---

## Rationale

Once a feature is archived the loop must not keep scanning it for work to do. Signal exclusion
is what keeps the active project-docs view clean — only live work generates signals.

Integrity findings still apply because a YAML error in an archived artifact affects reference
resolution for any active artifact that references it. The archive is not a blind graveyard;
it is still part of the graph.

This requirement covers the signal-emission side independently of the registry-keying side
(req-008). The registry must be implemented first — task-identification reads the registry's
archived flag — but both are independently testable once the registry layer is in place.
