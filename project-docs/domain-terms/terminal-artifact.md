---
term: Terminal Artifact
aliases: []
not_confused_with: []
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

An artifact whose type entry in `project-docs/artifact-schema.json` carries `"terminal": true`.
A terminal artifact signals that no further DDDD stages are expected downstream of it — it is
the last artifact in a requirement's delivery chain.

Currently, `iteration-retrospectives` is the only terminal type. A requirement is considered
complete when at least one of its transitive descendants is a Terminal Artifact.

**Used by**: the archive generator's completeness guard (req-007), which checks that every active
non-shared descendant of a feature has a Terminal Artifact somewhere in its lineage before
allowing an `archive-reason: completed` operation.

**Not confused with**: the `resolved` status of an open question or blocker. Resolution is tracked
via the `resolves:` frontmatter field and `tracksResolution: true` in artifact-schema.json — a
separate mechanism from termination, which is about delivery completeness.
