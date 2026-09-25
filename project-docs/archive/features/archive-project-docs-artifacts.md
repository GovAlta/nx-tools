---
title: archive project-docs artifacts
project-docs-ancestors: []
resolves: []
archive-reason: completed
---

The project-docs tree grows unboundedly as the DDDD loop progresses. Fully delivered features,
their requirements, and their designs remain in the active tree indefinitely, adding noise to
signal generation and making it harder to see what work is live.

Add an `nx g @abgov/nx-agent:archive` generator that moves a feature subtree from the active
`project-docs/` tree into `project-docs/archive/`, mirroring the same folder structure. The loop
skips `archive/` for signal generation but traverses into it for reference resolution, so active
artifacts (e.g. a bug) can still reference an archived ancestor without producing a broken-ref
violation.

The generator targets a feature as the root and walks its descendants, archiving the whole subtree
in one operation. Descendants that belong to more than one feature are left in place. The caller
declares an `archive-reason` — `completed` (all stages done, completeness guard runs first) or
`deferred` (explicitly parked, incompleteness expected) — written into each archived artifact's
frontmatter.
