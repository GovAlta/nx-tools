---
term: Artifact Metadata
aliases: []
not_confused_with: []
project-docs-ancestors: [bounded-contexts:lineage-graph]
resolves: []
---

The set of all frontmatter fields in a `project-docs/` artifact file that are not structural
fields — that is, all fields except `project-docs-ancestors` and `resolves`, which the lineage
graph already models as structural relationships.

Artifact Metadata is passed through verbatim from the artifact's YAML frontmatter into the
`metadata` property of its `RegistryEntry`. The values are not normalised, summarised, or
interpreted — a `rules: []` array and a `rules` array with entries are both present as-is.

**Structural fields** (always excluded from Artifact Metadata): `project-docs-ancestors`,
`resolves`. These two fields are what the graph builds its navigation structure from; including
them in metadata would duplicate data the graph already carries under dedicated properties.

**Non-structural fields** (always included, if present): `id`, `title`, `name`, `term`,
`service`, `audience`, `known-platforms`, `status`, `rules`, `questions`, `screens`, `examples`,
and any field a future artifact type introduces. The exclusion list is closed; the inclusion list
is open by design.

When an artifact has no parseable frontmatter block — either absent or malformed YAML — Artifact
Metadata is the empty object `{}`.
