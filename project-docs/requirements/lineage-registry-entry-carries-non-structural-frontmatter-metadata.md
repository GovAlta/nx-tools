---
title: Lineage registry entry carries non-structural frontmatter metadata
id: req-002
project-docs-ancestors:
  - product-briefs:lineage-graph
  - features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries
rules:
  - rule: every RegistryEntry includes all non-structural frontmatter fields verbatim under a metadata property
    examples:
      - "Given: a registered artifact with frontmatter fields id, title, rules, questions, project-docs-ancestors, and resolves;
         When: the registry entry is built;
         Then: metadata contains id, title, rules, and questions but not project-docs-ancestors or resolves"
    questions: []
  - rule: metadata is an empty object when the artifact has no parseable frontmatter block
    examples:
      - "Given: a registered artifact whose content has no --- delimited frontmatter block at all;
         When: the registry entry is built;
         Then: metadata is {} and no error is thrown"
      - "Given: a registered artifact whose --- delimited frontmatter block contains invalid YAML;
         When: the registry entry is built;
         Then: metadata is {} and no error is thrown (the parse failure is silently swallowed)"
    questions: []
  - rule: structural fields project-docs-ancestors and resolves are never included in metadata
    examples:
      - "Given: an artifact whose frontmatter contains only project-docs-ancestors and resolves with no other fields;
         When: the registry entry is built;
         Then: metadata is {}"
    questions: []
  - rule: no class of non-structural field is withheld from metadata on sensitive-content grounds
    examples:
      - "Given: a registered artifact whose frontmatter carries a notes field holding an internal endpoint URL;
         When: the registry entry is built;
         Then: metadata contains notes verbatim, neither filtered nor redacted"
    questions: []
questions: []
---
