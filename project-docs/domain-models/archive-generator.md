---
name: Archive Generator
project-docs-ancestors:
  - bounded-contexts:agent-delivery-harness
  - domain-terms:archive-reason
  - domain-terms:terminal-artifact
  - requirements:archive-generator-moves-an-artifact-to-the-archive-folder
  - requirements:archive-generator-walks-a-feature-subtree-and-archives-all-descendants
  - requirements:archive-generator-enforces-completeness-before-archiving-a-completed-feature
resolves: []
---

## Archive Destination

The archive destination for any `project-docs/<type>/<id>.md` is
`project-docs/archive/<type>/<id>.md`. The path is derived by inserting `archive/` immediately
after the `project-docs/` segment — no other transformation. The registry key is unchanged:
both `project-docs/features/foo.md` and `project-docs/archive/features/foo.md` resolve to the
key `features:foo` in `buildRegistry`.

**Invariant**: the generator operates on the Nx `Tree` (virtual filesystem). Writes to the Tree
are committed atomically when the generator returns successfully. If the generator throws, no
file is written or deleted. There is no partial-move state reachable from a single generator
invocation.

---

## Single-File Move (primitive)

`moveToArchive(host: Tree, sourcePath: string, archiveReason: ArchiveReason): void`

**Preconditions** (checked in order; first failure throws, no file touched):
1. `sourcePath` must contain a `project-docs/` segment.
2. The segment immediately following `project-docs/` must not be `archive`.
3. Exactly two path segments must follow `project-docs/` (i.e. `<type>/<id>.md`).
4. `host.exists(sourcePath)` must be true.
5. `host.isFile(sourcePath)` must be true.
6. Archive destination must not already exist.
7. `archiveReason` must be one of the two allowed values (`completed`, `deferred`).

**Steps**:
1. Read source content.
2. Inject `archive-reason: <archiveReason>` into the frontmatter block (appended before the
   closing `---`; if no frontmatter block exists, prepend one). No YAML re-serialisation — the
   value is a known safe enum member.
3. Write to archive destination.
4. Delete source.

---

## Archivable Subtree

Given a feature at `project-docs/features/<slug>.md`, the archivable subtree is:

> All transitive descendants of `features:<slug>` in the lineage graph's index, excluding any
> artifact that also appears as a transitive descendant of any *other* feature.

**Shared-descendant exclusion**: a descendant is shared if `index.get(descendantKey)` contains
more than one entry whose `type` is `features`. Shared descendants are left in place and logged
to stdout by name with the reason.

**Archive order**: descendants first (depth-first, leaves before parents), feature artifact last.
This ensures no file is left with a broken reference at any intermediate point during the move.

---

## Completeness Guard

Applies only when `archiveReason === 'completed'`. Runs before any file is moved.

For each artifact in the archivable subtree (shared descendants excluded):
- Walk its transitive descendants in the lineage graph.
- If none has a type whose `artifact-schema.json` entry carries `terminal: true`, the artifact
  is incomplete.

If any artifact is incomplete, throw with a message listing every incomplete artifact's slug.
The message must name every incomplete artifact, not just the first, so the caller can fix all
blockers in one pass.

**Invariant**: shared descendants are excluded from the completeness check because they are not
being archived — their state is irrelevant to this operation.

---

## CLI Schema

`nx g @abgov/nx-agent:archive <featurePath> [--archiveReason <reason>]`

| Option | Type | Required | Description |
|---|---|---|---|
| `featurePath` | string (positional) | yes | Path to the feature artifact to archive |
| `archiveReason` | `completed \| deferred` | yes | Archive Reason — validated before any file operation |

Stdout logs each archived path and each shared-descendant path left in place. Errors throw and
surface via Nx's standard generator error display.
