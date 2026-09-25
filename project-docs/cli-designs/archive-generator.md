---
cli-design: archive-generator
project-docs-ancestors: [domain-models:archive-generator]
resolves: []
---

## Command

```
nx g @abgov/nx-agent:archive <featurePath> --archiveReason <reason>
```

## Options

| Option | Type | Prompt | Required | Description |
|---|---|---|---|---|
| `featurePath` | string (positional, `$source: argv index 0`) | "Path to the feature artifact to archive (e.g. project-docs/features/foo.md)?" | yes | Must be a collection artifact under an active `project-docs/` tree |
| `archiveReason` | enum: `completed \| deferred` | "Archive reason? completed / deferred" | yes | Validated before any file operation |

## Behavior

**Pre-flight** (all preconditions checked before any file is moved):
1. `featurePath` exists and is a file
2. `featurePath` is under a `project-docs/` folder (not `project-docs/archive/`)
3. Exactly two path segments follow `project-docs/` (type + id.md)
4. `archiveReason` is `completed` or `deferred`
5. No archive destination already exists (none of the subtree's targets collide)
6. If `archiveReason` is `completed`: completeness guard passes (all non-shared descendants have a Terminal Artifact)
7. If `archiveReason` is `deferred`: completeness guard does not run — incompleteness is expected

**On success**:
- Each archivable descendant (transitive, leaves first) is moved to `project-docs/archive/<type>/<id>.md` with `archive-reason: <reason>` injected into its frontmatter
- The feature artifact itself is moved last
- Stdout logs one line per archived path: `[nx-agent] archived <source> → <dest>`
- Stdout logs one line per shared-descendant left in place: `[nx-agent] left in place (shared): <path>`

**On failure** (throws, no file written):
- Missing/invalid `featurePath`: names the path and the rule violated
- Already archived: `<path> is already in the archive`
- Destination collision: `<archivePath> already exists`
- Completeness guard failure: lists every incomplete descendant slug

## Tracing to requirements

| Behavior | Requirement |
|---|---|
| Archive destination derivation, frontmatter injection, source deletion | req-005 rules 1-3 |
| Rejection guards (not under project-docs/, already archived, destination exists, singular artifact) | req-005 rules 4-7 |
| archive-reason enum validation | req-005 rule 8 |
| Transitive subtree collection | req-006 rule 1 |
| Shared-descendant exclusion | req-006 rule 2 |
| Archive order (descendants before feature) | req-006 rule 3 |
| Stdout logging of archived/left-in-place paths | req-006 rule 4 |
| Completeness guard for `completed` | req-007 rules 1, 3, 4 |
| No guard for `deferred` | req-007 rule 2 |
