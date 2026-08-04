---
title: Requirement generator scaffolds correct shape with collision-free ID assignment
id: req-004
project-docs-ancestors:
  - service-descriptions:lineage-graph
  - features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries
rules:
  - rule: the generator creates project-docs/requirements/<slug>.md with the correct empty frontmatter shape
    examples:
      - "Given: the workspace has existing requirements with ids req-001 and req-002;
         When: nx g @abgov/nx-agent:requirement 'Create an evaluation matrix for a position' is run;
         Then: project-docs/requirements/create-an-evaluation-matrix-for-a-position.md is created with
         title 'Create an evaluation matrix for a position', id 'req-003', rules: [], questions: [], and
         project-docs-ancestors and resolves reflecting any flags passed"
    questions: []
  - rule: the generator assigns the next unused req-NNN id by inspecting metadata from the lineage graph
    examples:
      - "Given: the lineage graph registry contains requirements with metadata.id values req-001 and req-003;
         When: the requirement generator runs;
         Then: the new requirement is assigned req-004 (the next after the highest assigned numeric suffix)"
    questions: []
  - rule: the generator fails loudly if a requirement with the same slug already exists
    examples:
      - "Given: project-docs/requirements/create-an-evaluation-matrix-for-a-position.md already exists;
         When: the generator is run again with the same title;
         Then: an error is thrown and no file is written"
    questions: []
  - rule: the generator registers the requirements type in artifact-schema.json on first use
    examples:
      - "Given: artifact-schema.json does not yet have a requirements entry;
         When: the requirement generator runs for the first time;
         Then: artifact-schema.json gains requirements with expectedAncestorTypes: ['service-descriptions']"
      - "Given: artifact-schema.json already has a requirements entry;
         When: the requirement generator runs;
         Then: the existing entry is unchanged (merge-only behaviour)"
    questions: []
  - rule: the generator resolves and validates projectDocsAncestors and resolves paths before writing any file
    examples:
      - "Given: --projectDocsAncestors includes a path that does not exist in project-docs/;
         When: the generator runs;
         Then: an error is thrown before any file is written"
    questions: []
questions:
  - "should the requirement generator regenerate the lineage graph before reading metadata.id values for ID assignment, or document that the caller must ensure lineage.json is current? If the graph is stale the collision-free guarantee silently breaks. Options: (a) run project-docs-lineage as a prerequisite step in the generator, (b) fall back to scanning project-docs/requirements/*.md frontmatter directly when metadata.id is absent, (c) document the staleness risk explicitly and accept it."
---
