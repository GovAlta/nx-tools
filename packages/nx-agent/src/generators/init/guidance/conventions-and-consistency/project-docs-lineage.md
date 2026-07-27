**Project-docs lineage.** When a file (code, test, or another `project-docs/` artifact) is built on
top of something else in `project-docs/` — a domain term, a bounded context, a requirement, any
artifact kind that folder holds — say so with a `project-docs-ancestors` reference, so that relationship
is recorded rather than left implicit. Same directive, two forms: a frontmatter list on a doc
artifact, or a comment near the top of a code/test file. Value shape is `<type>[:<id>][#fragment]`,
comma-separated for more than one (there's no single-"parent" constraint — deriving from several
unrelated artifacts at once is normal). `type` is the literal `project-docs/` subfolder name, no
plural-to-singular guessing; `id` is the filename minus extension for a collection artifact (many
instances, one file each, inside a type-named folder), and omitted entirely for a singular one (a
type with exactly one file, directly under `project-docs/`, no subfolder) — e.g. `domain-terms:case`
for a term, `architecture-overview` alone for a one-off doc. Only ever reference something that
already exists — this is a backward reference, and deriving from a thing that doesn't exist yet
isn't a real case. `nx g @abgov/nx-agent:domain-term --project-docs-ancestors <path>` resolves and writes
this for you (from an existing artifact's path, not a hand-typed `type:id` string) rather than
requiring you to know the format; other artifact-producing generators should do the same. Run
`nx g @abgov/nx-agent:project-docs-lineage` to build the full graph and catch a broken reference —
not yet wired into the pre-commit hook, so run it yourself after adding or changing a reference.
