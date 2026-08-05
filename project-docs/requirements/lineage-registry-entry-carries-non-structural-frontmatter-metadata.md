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
questions:
  - "lineage.json is committed to the repository; should any class of frontmatter field be excluded from metadata on the grounds that project-docs/ artifacts could inadvertently contain sensitive content (e.g. an internal endpoint URL or credential pasted into a notes field)? Current proposal: pass all non-structural fields verbatim with no filtering. Advisory for development-tooling context."
---
