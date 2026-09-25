---
title: registry and signal layer treats archived artifacts as resolved and invisible to signals
id: req-008
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: buildRegistry traverses project-docs/archive/ and registers archived artifacts under the same key as their active counterpart would use
    examples:
      - "Given project-docs/archive/features/foo.md exists, when buildRegistry runs, then
        registry.get('features:foo') is defined"
      - "Given project-docs/archive/features/foo.md exists, when buildRegistry runs, then the
        registry entry for features:foo has archived: true"
    questions: []
  - rule: an active artifact referencing an archived artifact produces no broken-ref violation
    examples:
      - "Given a bug artifact whose project-docs-ancestors includes features:foo, and features:foo
        exists at project-docs/archive/features/foo.md, when project-docs-lineage runs, then no
        broken-ref violation is reported"
    questions: []
  - rule: archived artifacts are excluded from unreferenced, unscoped, and resolution.open signal outputs
    examples:
      - "Given features:foo is archived with no descendants pointing to it from active artifacts,
        when computeFindings runs, then features:foo does not appear in unreferenced"
      - "Given an archived open-question artifact, when computeFindings runs, then it does not
        appear in resolution.open"
    questions: []
  - rule: integrity findings (broken refs, YAML errors, cycles, schema errors) still apply to archived artifacts
    examples:
      - "Given project-docs/archive/features/foo.md contains malformed YAML frontmatter, when
        project-docs-lineage runs, then a YAML error is reported for that file"
    questions: []
  - rule: task-identification.mjs skips archived artifacts in all signal-emission loops
    examples:
      - "Given a feature artifact exists at project-docs/archive/features/foo.md with no
        descendants, when task-identification runs, then no signal is emitted for features:foo"
    questions: []
questions: []
---

## Rationale

Once a feature is archived the loop must not keep scanning it for work to do. But archived
artifacts still exist and may be referenced by active work (a bug against an archived feature,
a new feature describing an iteration on prior art). The registry must know about them so that
reference resolution works, while signal generation must never treat them as live work.

The same registry key for active and archived artifacts (not `archive/features:foo` but
`features:foo`) is what makes cross-references from active artifacts resolve cleanly without
any special-casing in the referencing artifact.
