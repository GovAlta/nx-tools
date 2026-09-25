---
term: Shared Descendant
aliases: []
not_confused_with: []
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

A transitive descendant of a feature that also appears as a transitive descendant of at least one
other feature in the lineage graph.

Formally: artifact `D` is a Shared Descendant of `features:foo` if `D` is reachable from
`features:foo` through the lineage index, and there exists at least one other `features:bar`
(where `bar ≠ foo`) from which `D` is also reachable.

**Why it matters**: Shared Descendants must not be moved when archiving `features:foo` — doing so
would remove them from the active tree while `features:bar` still depends on them, producing
broken-ref violations. The archive generator leaves Shared Descendants in place and logs each one
to stdout with its reason.

**Not confused with**: a descendant that was *authored* by one feature but *referenced* by
another. Ancestry in the lineage graph is determined by the `project-docs-ancestors` frontmatter
field — if an artifact lists two features as ancestors, it is a Shared Descendant of both. If it
lists only one, it is not shared, regardless of whether another feature's design prose mentions it.
