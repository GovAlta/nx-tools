---
term: Release Artifact
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

A file at `project-docs/releases/<slug>.md` that names a versioned delivery boundary. It carries
a `release-name` identity field, a `project-docs-ancestors` list pointing at the `features:`
entries whose signals belong to this release, and a free-text goal statement in the body
describing what a developer can do when this release ships.

A release artifact is **active** when it exists in `project-docs/releases/` (not in
`project-docs/archive/releases/`). An archived release artifact no longer contributes to
scope resolution.

A release artifact is not a code version — it is a scoping declaration for one DDDD iteration
cycle. Archiving it when the iteration completes is the exit signal, not the publication of a
package version.
