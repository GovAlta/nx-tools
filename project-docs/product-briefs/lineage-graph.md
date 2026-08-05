---
capability: Lineage Graph
audience: [AI coding agents navigating the DDDD workflow, nx-agent generator implementations]
known-platforms: [nx-agent]
questions: []
project-docs-ancestors: [features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries]
---

The Lineage Graph is the artifact-navigation and artifact-content service built by the
`project-docs-lineage` generator in `@abgov/nx-agent`. It produces a `lineage.json` file with two
parts: a `registry` (every known artifact, keyed by `type:id`, recording its structural refs) and
an `index` (the reverse — every ancestor keyed to the list of artifacts and files that descend
from it).

The graph allows agents and generators to navigate the artifact graph without walking the full
`project-docs/` tree. Currently it answers navigation questions (what exists, how things connect)
but not content questions (what does a given artifact contain), forcing a second round of file
reads whenever content is needed.

Outside the boundary: the business domain being described (requirements, product briefs,
domain models), the DDDD skill files themselves, and the OpenShift/ADSP infrastructure consuming
projects deploy to.
