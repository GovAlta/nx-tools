---
name: Lineage Graph Metadata
project-docs-ancestors: [bounded-contexts:lineage-graph, domain-terms:artifact-metadata, requirements:lineage-registry-entry-carries-non-structural-frontmatter-metadata, requirements:lineage-index-entry-carries-optional-frontmatter-metadata-for-registered-artifact-descendants, requirements:requirement-generator-scaffolds-correct-shape-with-collision-free-id-assignment]
resolves: []
---

## Structural Frontmatter Fields

A closed constant set — exactly two entries: `project-docs-ancestors` and `resolves`. These are
the only frontmatter fields the graph already models as first-class structural relationships.
Every other field is non-structural and belongs in Artifact Metadata.

**Invariant**: the exclusion list is closed and small by design. Adding a new structural field
to the graph requires an explicit, named change to this constant — it never happens implicitly.

---

## `extractFrontmatterMetadata(content: string): Record<string, unknown>`

New helper function (alongside the existing `extractFrontmatterField` and
`extractFrontmatterAncestorRefs`). Parses the YAML frontmatter block, removes all structural
fields, and returns the rest verbatim.

**Algorithm**:
1. Extract the `---…---` frontmatter block with the existing `FRONTMATTER_BLOCK` regex.
2. Parse the block with `yaml.parse` (same library already imported). On parse failure or absent
   block, return `{}` silently — same error-swallowing posture the existing
   `extractFrontmatterField` already uses.
3. Check that the parsed value is a non-null object; if not, return `{}`.
4. Iterate over the object's own entries. For each key not in
   `STRUCTURAL_FRONTMATTER_FIELDS`, copy it to the output object verbatim (no type coercion,
   no normalisation).
5. Return the output object.

**Invariant**: a malformed frontmatter block never throws to the caller — the error is swallowed
and `{}` is returned. This matches the existing defensive pattern throughout the module.

---

## Extended `RegistryEntry`

Gains one new required field: `metadata: Record<string, unknown>`.

`metadata` is the Artifact Metadata for this entry — the result of calling
`extractFrontmatterMetadata` on the artifact's full file content at registration time.

**Invariant**: `metadata` is never absent and never `undefined`. When an artifact has no
parseable frontmatter, `metadata` is `{}`.

`registerArtifact` (the internal function that writes each entry) reads the file content once
and calls `extractFrontmatterMetadata` on the same `content` string it already uses for
`extractFrontmatterAncestorRefs` and `extractFrontmatterField` — no additional file read.

---

## Extended `DescendantEntry`

Gains one new optional field: `metadata?: Record<string, unknown>`.

`metadata` is present only when the descendant is a registered artifact — i.e. when
`buildIndex` resolves the `descendantKey` from `pathToKey`. For plain source files (`.ts`,
`.tsx`, etc.) that carry a `// project-docs-ancestors` comment, `metadata` is absent (not even
set to `undefined` — the property is simply not written, so JSON serialisation produces
`{ "file": "..." }` with no extra keys).

When `metadata` is present, it is exactly `registry.get(descendantKey)!.metadata` — a direct
reference to the already-computed registry entry, not a second parse.

**Invariant**: `metadata` on a `DescendantEntry` is always identical (deeply equal) to the
`metadata` on the corresponding `RegistryEntry`. No desync is possible since they share the
same object reference within a single generator pass.

---

## Requirement Generator

New generator: `@abgov/nx-agent:requirement`. Follows the `domain-term` pattern precisely:
fail loudly on duplicate slug, validate ancestors before any write, ensure container README,
ensure `artifact-schema.json` entry.

**ID assignment — stale-graph question resolved**: the generator reads `project-docs/requirements/`
directly from the `Tree` (the in-memory virtual filesystem `@nx/devkit` provides to generators).
The Tree is always current at generator invocation time — it reflects every file in the workspace,
including requirements written in the same session before the current generator call, without
needing `lineage.json` to be regenerated first. The generator scans all `.md` files in
`project-docs/requirements/` (excluding `README.md`), parses each file's `id` field from its
YAML frontmatter using the existing `yaml.parse` + `FRONTMATTER_BLOCK` pattern, collects the
numeric suffixes from any `req-NNN` shaped values, and assigns `req-(max + 1)`, left-padded to
three digits. If no existing `req-NNN` values are found, assigns `req-001`.

This eliminates the staleness risk without adding a generator-calls-generator dependency. The
lineage graph's metadata field remains useful for callers that have already loaded the graph for
other purposes (e.g. an agent reading `lineage.json` to plan work) — the generator's direct-scan
approach is not a contradiction.

**Duplicate-slug check**: before any write, check whether the target path already exists in the
Tree. If it does, throw with a message pointing at the existing file — same guard as `domain-term`.

**Schema options**:
- `title` (required, positional): the short descriptive title. Slug derived with `names(title).fileName`.
- `project` (optional): scope to a specific project's `project-docs/requirements/` instead of
  the workspace root.
- `projectDocsAncestors` (optional, array): paths to ancestor artifacts; resolved and validated
  before any write via `resolveAncestorsAndResolves`.
- `resolves` (optional, array): paths to open-question/blocker artifacts being resolved.

**Output file shape** (YAML frontmatter only, no body):
```
---
title: <title>
id: req-<NNN>
project-docs-ancestors: [<resolved ancestor refs>]
resolves: [<resolved refs>]
rules: []
questions: []
---
```

**`artifact-schema.json` registration**: calls `ensureArtifactSchemaEntry(host, 'requirements',
['product-briefs'])` — merge-only, idempotent, same call every generator makes on first use.
The `product-briefs` parent type is correct: every requirement must trace back to a
product brief (see `artifact-schema.json`'s own `requirements` entry, and the Discover
intake convention that seeds each requirement with a product-brief ancestor).

**Ancestor/resolves path validation**: `projectDocsAncestors` and `resolves` paths are each
resolved via `resolveRefFromPath` (the same function used by every other generator). This
function checks that: (a) the target file exists in the Tree, (b) it lies under a
`project-docs/` folder, and (c) it is at most one level deep under that folder. Any failure
throws an error before any file is written — a failing run has no side effects.

**Sensitive frontmatter in metadata** (advisory question from req-002): no field exclusions are
applied. All non-structural frontmatter is passed through verbatim. `project-docs/` artifacts
are development-workflow artifacts (requirements, domain models, service descriptions) — not
business data, not user PII. `lineage.json` is committed to the repository in any case; the
additional metadata fields add no novel exposure class beyond what the artifact files themselves
already represent. Decision: accepted. No filtering mechanism is introduced.
