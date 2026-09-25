---
title: registry registers archived artifacts under their active key
id: req-008
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: buildRegistry traverses project-docs/archive/ and registers archived artifacts under the same key as their active counterpart would use
    examples:
      - "Given project-docs/archive/features/foo.md exists, when buildRegistry runs, then
        registry.get('features:foo') is defined and has archived:true"
      - "Given project-docs/archive/requirements/bar.md exists, when buildRegistry runs, then
        registry.get('requirements:bar') is defined and has archived:true"
    questions: []
  - rule: an active artifact referencing an archived artifact produces no broken-ref violation
    examples:
      - "Given a bug artifact whose project-docs-ancestors includes features:foo, and features:foo
        exists at project-docs/archive/features/foo.md only, when project-docs-lineage runs, then
        no broken-ref violation is reported for that reference"
    questions: []
  - rule: when both an active and an archived file resolve to the same registry key the active file wins and project-docs-lineage reports an integrity violation naming both paths
    examples:
      - "Given project-docs/features/foo.md and project-docs/archive/features/foo.md both exist,
        when buildRegistry runs, then registry.get('features:foo') reflects the active file's
        content with no archived field present (not archived:false), and project-docs-lineage
        reports an integrity violation for the duplicate key naming both paths"
    questions: []
questions: []
---

## Rationale

Cross-references from active artifacts (e.g. a bug pointing to an archived feature) must resolve
without producing broken-ref violations. Using the same registry key for active and archived
artifacts is what makes this work without special-casing in every referencing artifact.

The key collision rule handles the case where both files exist simultaneously — which a Nx
generator cannot produce (Tree writes are atomic) but a manual file operation can. Active wins
because an active artifact is still live work; the integrity violation surfaces the collision so
it can be cleaned up.
