---
title: archive generator walks a feature subtree and archives all descendants
id: req-006
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: when given a feature path the generator collects all lineage descendants of that feature
    examples:
      - "Given a feature with two requirements each having a design artifact, when the generator
        runs, then all five artifacts (feature, 2 requirements, 2 designs) are candidates for
        archiving"
    questions: []
  - rule: descendants that appear in the lineage graph under more than one feature are excluded from the move and left in place
    examples:
      - "Given requirement req-X is an ancestor of both features:foo and features:bar, when
        features:foo is archived, then req-X is not moved and remains at its original path"
      - "Given requirement req-Y is an ancestor of only features:foo, when features:foo is archived,
        then req-Y is moved to the archive"
    questions: []
  - rule: the feature artifact itself is archived after all its descendants
    examples:
      - "Given a feature with one requirement, when the generator runs, then the requirement is
        moved first and the feature artifact is moved last"
    questions: []
  - rule: the generator reports which descendants were archived and which were left in place due to shared ancestry
    examples:
      - "Given a feature with two requirements where one is shared, when the generator runs, then
        the console output names the archived paths and identifies the shared requirement as left in
        place with its reason"
    questions: []
questions: []
---

## Rationale

Archiving a feature one artifact at a time leaves the graph in a partial state between operations,
which can produce spurious signals or broken-ref violations mid-way through. A single subtree
operation is atomic from the loop's perspective: either the feature and all its archivable
descendants move together, or none do.

Shared descendants must stay in place because moving them would break the other feature's lineage
graph. The generator must identify these before moving anything.
