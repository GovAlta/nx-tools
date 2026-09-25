---
title: archive generator enforces completeness before archiving a completed feature
id: req-007
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: when archive-reason is completed the generator checks that all active non-shared descendants have a terminal artifact in their lineage
    examples:
      - "Given a feature whose requirement has an iteration-retrospective descendant (terminal),
        when archived with reason completed, then the completeness guard passes and the archive
        proceeds"
      - "Given a feature whose requirement has no terminal descendant, when archived with reason
        completed, then the generator throws and names the incomplete requirement"
    questions: []
  - rule: when archive-reason is deferred no completeness check runs
    examples:
      - "Given a feature whose requirement has no terminal descendant, when archived with reason
        deferred, then the generator proceeds without error and archives all non-shared descendants"
    questions: []
  - rule: the completeness error names every incomplete active descendant so the caller knows exactly what to fix
    examples:
      - "Given two requirements both missing terminal descendants, when archived with reason
        completed, then the error message lists both requirement slugs"
    questions: []
  - rule: shared descendants are excluded from the completeness check
    examples:
      - "Given a shared requirement with no terminal descendant, when the feature it belongs to
        alongside another feature is archived with reason completed, then the shared requirement
        does not cause a completeness error (it is not being archived)"
    questions: []
questions: []
---

## Rationale

The `completed` reason carries a contract: everything is done. Archiving an incomplete subtree
as completed would misrepresent the state to anyone reading the archive later. The guard is the
machine-checkable equivalent of the human reading the lineage report and confirming all stages
are done — it runs so the human doesn't have to.

The `deferred` path intentionally bypasses the guard because a deferred feature is being parked
precisely because it is not complete. Incompleteness is expected and correct in that case.
