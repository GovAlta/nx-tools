---
term: Archive Reason
aliases: []
not_confused_with: []
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

The caller-declared intent behind an archive operation. One of two values:

- **`completed`** — the feature and all its archivable descendants have been fully delivered
  through every DDDD stage, confirmed by the presence of a Terminal Artifact in each
  descendant's lineage. The completeness guard runs before any file is moved.
- **`deferred`** — the feature is being explicitly parked: wrong timing, competing priority, or a
  dependency not yet ready. Incompleteness is expected and correct; the completeness guard does
  not run.

The value is written into the `archive-reason` frontmatter field of every artifact moved to
`project-docs/archive/`. It is constrained to the two values above — the generator validates
before any file operation.

**Not confused with**: a feature's DDDD stage status. Archive Reason classifies the lifecycle
decision at the moment of archiving; stage status records which DDDD stages have run. A deferred
feature may have zero stages complete; a completed feature must have all stages complete (enforced
by the guard).
