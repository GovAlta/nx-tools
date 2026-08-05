---
title: fix lineage yaml parse error warning
project-docs-ancestors: [bugs:lineage-tool-silently-drops-artifacts-with-invalid-yaml-frontmatter]
resolves: [bugs:lineage-tool-silently-drops-artifacts-with-invalid-yaml-frontmatter]
---

`extractFrontmatterField`, `extractFrontmatterMetadata`, and `extractFrontmatterAncestorRefs`
all had bare `catch {}` blocks that swallowed js-yaml parse exceptions, falling through to the
empty-result path. `buildRegistry` then registered the artifact with no ancestor refs and the
lineage report showed it as "unscoped" with no indication of why.

Fix: added an optional `sourcePath` parameter to each extract function. On catch, emits
`console.warn` with the filename and the yaml error message before returning the empty fallback.
`registerArtifact` passes `path` through so the warning always includes the filename in practice.

Two new unit tests added to `project-docs-refs.spec.ts`: one asserts `console.warn` fires on
malformed YAML, one asserts the source path appears in the message. All 264 nx-agent tests pass;
build and lint clean.
