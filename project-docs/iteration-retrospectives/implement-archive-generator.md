---
title: implement archive generator
project-docs-ancestors: [cli-designs:archive-generator, requirements:archive-generator-moves-an-artifact-to-the-archive-folder, requirements:archive-generator-walks-a-feature-subtree-and-archives-all-descendants, requirements:archive-generator-enforces-completeness-before-archiving-a-completed-feature, requirements:registry-and-signal-layer-treats-archived-artifacts-as-resolved-and-invisible-to-signals, requirements:signal-layer-excludes-archived-artifacts-from-all-signal-outputs]
resolves: []
---

Implemented `nx g @abgov/nx-agent:archive <featurePath> --archiveReason <reason>`.

Changes:
- `project-docs-refs.ts`: `buildRegistry` now traverses `project-docs/archive/` first,
  registering archived entries with `archived?: true`. Active wins on collision;
  `ArchiveKeyCollision` added to `Integrity`. `computeFindings` excludes archived artifacts
  from unreferenced, unscoped, stale, and resolution.open.
- `project-docs-lineage.ts`: emits archive-collision console output; `INTEGRITY_FAILURES`
  covers the new category.
- `archive/` generator: `schema.json`, `schema.d.ts`, `archive.ts`, `archive.spec.ts`.
  Implements pre-flight guards, subtree walk (leaves first, feature last), shared-descendant
  detection via pre-computed feature subtrees, completeness guard, and project-scoped path
  handling (archive destination preserves the project root prefix).
- `task-identification.mjs` (template + workspace copy): skips `registry[key]?.archived`
  in all signal loops; emits `archive-collision:` signals.

Gate: 360 tests pass, 0 lint errors, build clean, lineage --strict clean.
