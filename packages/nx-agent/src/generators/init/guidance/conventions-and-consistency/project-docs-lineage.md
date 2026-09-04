**Project-docs lineage.** When a file (code, test, or another `project-docs/` artifact) is built on
top of something else in `project-docs/` — a domain term, a bounded context, a domain model, any
artifact kind that folder holds — say so with a `project-docs-ancestors` reference, so that
relationship is recorded rather than left implicit. Same directive, two forms: a frontmatter list on
a doc artifact, or a comment near the top of a code/test file. Value shape is
`<type>[:<id>][#fragment]`, comma-separated for more than one (there's no single-"parent"
constraint — deriving from several unrelated artifacts at once is normal). `type` is the literal
`project-docs/` subfolder name, no plural-to-singular guessing; `id` is the filename minus extension
for a collection artifact (many instances, one file each, inside a type-named folder), and omitted
entirely for a singular one (a type with exactly one file, directly under `project-docs/`, no
subfolder) — e.g. `domain-terms:case` for a term, `architecture-overview` alone for a one-off doc.
Only ever reference something that already exists — this is a backward reference, and deriving from
a thing that doesn't exist yet isn't a real case. `nx g @abgov/nx-agent:domain-term`,
`:bounded-context`, `:domain-model`, `:open-question`, `:blocker`, and `:iteration-retrospective`
each resolve a `--project-docs-ancestors <path>` for you (from an existing artifact's path, not a hand-typed
`type:id` string) rather than requiring you to know the format; other artifact-producing generators
should do the same. Run `nx g @abgov/nx-agent:project-docs-lineage` to build the full graph and catch
a broken reference — not yet wired into the pre-commit hook, so run it yourself after adding or
changing a reference. `nx g @abgov/nx-agent:project-docs-report` builds the same graph into a
human-readable, self-contained HTML report (status summary + a Mermaid lineage diagram) instead of
`lineage.json` — optionally scoped to one project with `--project`.

**Open questions and blockers.** `nx g @abgov/nx-agent:open-question`/`:blocker` capture something
undecided or something that needs revision as its own artifact, rather than leaving it in prose where
it's easy to lose track of. They're resolved by a _different_ artifact — the one that actually settles
it — passing `--resolves <path>` (on `domain-term`/`bounded-context`/`domain-model`/
`iteration-retrospective`), not by
hand-editing the question/blocker file itself. `--resolves` is layered on top of
`--project-docs-ancestors` (the resolved ref lands in both places), so it's still visible to normal
lineage traversal; the distinct `resolves` field is what lets `project-docs-lineage` report a question
or blocker as resolved specifically, rather than mistaking any artifact that merely cites it for
context as having settled it. Hand-authoring a resolution for a type with no generator yet (the
normal state before one exists) doesn't need that duplication done by hand — a `resolves:` entry
alone is enough; lineage traversal unions it in for you, so the resolved artifact doesn't also need
to appear in `project-docs-ancestors` to avoid being misreported as unreferenced.

**Where an artifact belongs**, one level below the format above: a bounded context, domain model, or
domain term can be scoped to a specific project (`--project <p>`) instead of the workspace root, and
"shared across several projects" is not the same question as "workspace root or not." Prefer scoping
to the project that already owns the concept in code — most often a domain library several
apps/services depend on — since that's where someone touching the domain logic will actually look,
and the project-qualified reference form (`<project>/type:id`) already lets every consumer point at
it precisely. Reserve the workspace root for a concept genuinely without a single owning project (a
cross-cutting decision, or a workspace where domain code hasn't been organized into libraries yet) —
not as a default just because something is widely used.

**Expected ancestors.** An artifact-producing generator can declare, in
`project-docs/artifact-schema.json`, what ancestor type(s) its own kind normally expects — e.g. a
domain term expecting a bounded context — by writing its own entry there on first use
(`{ "<type>": { "expectedAncestorTypes": ["<type>", ...] } }`). That list is all-of, not any-of: a
domain model expecting both a bounded context and a domain term is still missing part of its
vocabulary with only one of the two. `project-docs-lineage` reads this file generically, with no
knowledge of any specific type baked in, and reports — never fails, since this is a convention nudge
rather than a hard rule — an artifact of a scoped type missing one of its expected ancestors as
"unscoped." The same file also supports `"terminal": true` for a type meant purely as a close-out
record (a retrospective, for instance) — nothing is ever expected to derive from it, so it's excluded
from the `unreferenced` report (zero descendants) that would otherwise flag it identically to a
domain-model nobody's built on yet.

**Two kinds of finding, and only one of them blocks.** `project-docs-lineage` splits what it reports
into `integrity` — a reference whose target doesn't exist, a token that isn't a reference at all,
frontmatter that won't parse, a cycle, a schema entry naming a type that doesn't exist — and
`status`, which is a sound graph telling you where the work stands (nothing derives from it yet, an
expected ancestor is missing, an ancestor was revised after this derived from it). `--strict` fails
on integrity and never on status, so use it as a gate freely: it can't be tripped by work merely
being incomplete.

**Recording that you've read an ancestor.** A reference may carry the ancestor's body digest —
`domain-terms:case@a3f9c2e1b004` — and `project-docs-lineage` then reports it as `stale` once that
ancestor is revised, meaning your artifact may no longer reflect what it was built from. An
unpinned reference is never reported, so this costs nothing until you opt a reference in with
`nx g @abgov/nx-agent:pin-ancestors`. Re-pin only after actually re-reading the ancestor — the
digest is an assertion that you have, it lands in your own diff, and a blind bulk re-pin just
records existing drift as the new floor.
