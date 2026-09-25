---
title: archive generator moves an artifact to the archive folder
id: req-005
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:archive-project-docs-artifacts]
resolves: []
rules:
  - rule: the archive destination mirrors the source path with archive/ inserted after project-docs/
    examples:
      - "Given a source path of project-docs/features/foo.md, when the generator runs, then the
        destination is project-docs/archive/features/foo.md"
      - "Given a source path of project-docs/requirements/bar.md, when the generator runs, then the
        destination is project-docs/archive/requirements/bar.md"
    questions: []
  - rule: archive-reason is injected into the artifact's frontmatter before writing to the archive destination
    examples:
      - "Given an artifact with no archive-reason field, when archived with reason completed, then
        the archived file contains archive-reason: completed in its frontmatter"
      - "Given an artifact with no archive-reason field, when archived with reason deferred, then
        the archived file contains archive-reason: deferred in its frontmatter"
    questions: []
  - rule: the source file is deleted after the archive copy is written
    examples:
      - "Given project-docs/features/foo.md exists, when the generator runs to completion, then
        project-docs/features/foo.md no longer exists and project-docs/archive/features/foo.md does"
    questions: []
  - rule: the generator rejects a source path not under any project-docs/ folder
    examples:
      - "Given a path of packages/nx-agent/src/index.ts, when the generator runs, then it throws
        with a message that the path is not under project-docs/"
    questions: []
  - rule: the generator rejects a source path already under project-docs/archive/
    examples:
      - "Given a path of project-docs/archive/features/foo.md, when the generator runs, then it
        throws with a message that the artifact is already archived"
    questions: []
  - rule: the generator rejects when the archive destination already exists
    examples:
      - "Given project-docs/archive/features/foo.md already exists, when the generator is asked to
        archive project-docs/features/foo.md, then it throws before writing anything"
    questions: []
  - rule: the generator rejects singular artifacts directly under project-docs/ (not in a type subfolder)
    examples:
      - "Given a path of project-docs/service-description.md (one segment below project-docs/),
        when the generator runs, then it throws with a message that singular artifacts are not
        archivable"
    questions: []
questions: []
---

## Rationale

Without an archive mechanism the project-docs tree grows unboundedly. Every artifact from a
delivered feature stays in the active tree indefinitely, adding noise to signal generation and
making it harder to see what work is live.

The single-file move is the primitive that all higher-level operations (subtree walk, close-release)
are built from. It is the unit testable foundation of the archive feature.
