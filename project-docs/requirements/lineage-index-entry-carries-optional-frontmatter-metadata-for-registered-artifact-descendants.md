---
title: Lineage index entry carries optional frontmatter metadata for registered-artifact descendants
id: req-003
project-docs-ancestors:
  - product-briefs:lineage-graph
  - features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries
rules:
  - rule: a DescendantEntry that corresponds to a registered artifact includes its metadata from the registry
    examples:
      - "Given: an index entry whose file is a registered artifact with a known type and a non-empty registry metadata object;
         When: the index is built;
         Then: the DescendantEntry has a metadata property matching the registry entry's metadata"
    questions: []
  - rule: a DescendantEntry for a plain source file (no artifact type) has no metadata property
    examples:
      - "Given: an index entry whose file is a TypeScript source file carrying a project-docs-ancestors comment but no registered artifact type;
         When: the index is built;
         Then: the DescendantEntry has neither a metadata key present nor a type key — JSON serialisation produces { file: '...' } with no other properties"
    questions: []
  - rule: metadata in the index equals the registry entry's metadata for the same artifact
    examples:
      - "Given: a registered artifact whose registry entry has metadata { id: 'req-001', title: 'some title', rules: [] };
         When: buildIndex produces a DescendantEntry for that artifact;
         Then: the DescendantEntry's metadata is deeply equal to { id: 'req-001', title: 'some title', rules: [] }"
    questions: []
questions: []
---
