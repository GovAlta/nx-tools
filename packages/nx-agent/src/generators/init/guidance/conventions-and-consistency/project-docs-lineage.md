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
`:bounded-context`, and `:domain-model` each resolve a `--project-docs-ancestors <path>` for you
(from an existing artifact's path, not a hand-typed `type:id` string) rather than requiring you to
know the format; other artifact-producing generators should do the same. Run
`nx g @abgov/nx-agent:project-docs-lineage` to build the full graph and catch a broken reference —
not yet wired into the pre-commit hook, so run it yourself after adding or changing a reference.

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
`project-docs/artifact-schema.json`, what ancestor type its own kind normally expects — e.g. a domain
term expecting a bounded context — by writing its own entry there on first use
(`{ "<type>": { "expectedAncestorTypes": ["<type>", ...] } }`). `project-docs-lineage` reads this file
generically, with no knowledge of any specific type baked in, and reports — never fails, since this
is a convention nudge rather than a hard rule — an artifact of a scoped type with no matching
ancestor as "unscoped."
