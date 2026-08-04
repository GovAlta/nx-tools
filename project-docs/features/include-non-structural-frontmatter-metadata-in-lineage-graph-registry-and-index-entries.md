---
title: Include non-structural frontmatter metadata in lineage graph registry and index entries
project-docs-ancestors: []
resolves: []
---

Extend `RegistryEntry` and `DescendantEntry` in the lineage graph so that all non-structural
frontmatter fields from each registered artifact pass through verbatim as a `metadata` object.

Right now the graph records only structural fields (`ancestorRefs`, `resolves`, `path`, `file`,
`type`). When an agent needs content — which `req-NNN` IDs are already taken, whether any
requirements still have empty `rules` — it must read individual artifact files separately, even
though it just traversed the graph to find them.

Both failure modes have the same root cause: the graph is navigation-complete but content-empty.
Adding verbatim metadata to `RegistryEntry` and (optionally, for registered-artifact descendants)
to `DescendantEntry` makes the graph a single-read, queryable snapshot of artifact metadata.

Additionally, since requirements are the most frequently produced artifact in the workflow and are
currently hand-authored (risk of wrong YAML shape, missing fields, ID collision), a thin
`requirement` generator should scaffold the correct empty shape and auto-assign the next
unused `req-NNN` ID by reading `metadata.id` values from the graph — a use case that depends on
the metadata change above.
