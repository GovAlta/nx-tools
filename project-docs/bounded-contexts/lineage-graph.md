---
name: Lineage Graph
aliases: []
not_confused_with: []
project-docs-ancestors: [features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries]
resolves: []
---

**Inside**: the data structures that make up the graph (`RegistryEntry`, `DescendantEntry`, the
Registry map, and the Index map), the `project-docs-lineage` generator that builds and writes
`lineage.json`, the frontmatter-parsing helpers that produce those data structures, and the
artifact generators (such as `requirement`) that query the graph for ID assignment or ancestry
lookups.

**Outside**: the content of the artifacts the graph describes (what a requirement says, what a
domain model models), the DDDD skill instructions themselves, the agent-delivery harness that
sequences those skills, and the OpenShift/ADSP infrastructure consuming projects deploy to.
