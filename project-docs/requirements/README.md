# Requirements

Scoped, example-mapped requirements for this initiative — one file per requirement, each deriving
from a product-brief ancestor. Produced by the Discover skill's refinement pass.

Add a requirement with `nx g @abgov/nx-agent:requirement "<title>"` — don't hand-author files
here, so the frontmatter shape and sequential ID stay consistent. Each file:

    ---
    title: Create an evaluation matrix for a position
    id: req-001
    project-docs-ancestors: [product-briefs:candidate-evaluation]
    resolves: []
    rules: []
    questions: []
    ---

    ## Rationale

    Why this requirement exists — the constraint, obligation, or user need behind it.

- `title` — the short descriptive title, matching the filename slug.
- `id` — sequential human-facing label (`req-NNN`), auto-assigned at creation time. Not the graph
  key (the file's slug is); used by agents to reference requirements in prose and conversation.
- `project-docs-ancestors` — the product brief this requirement derives from. Set with
  `--projectDocsAncestors <path>` at creation time.
- `rules` — example-mapped rules (Given/When/Then examples per rule). Populated by the Discover
  skill's refinement pass; left empty at intake.
- `questions` — open questions that don't attach to a specific rule.

The **body** is rationale: _why_ this requirement exists, as prose. `rules` is _what_ must be true
and how you'd test it; the body is the constraint or obligation behind them, explained where someone
reading the requirement will see it. The product brief ancestor carries the wider goal — this is the
part specific to this requirement.

Requirements are the one artifact type whose meaning lives in frontmatter rather than the body, so
`project-docs/artifact-schema.json` declares `digestFields: ["rules"]` for them. A change to `rules`
therefore marks descendants stale (see `project-docs-lineage`'s `status.stale`); editing the
rationale, fixing a `title`, or answering a `question` does not.

List this folder before creating a new requirement — `id` values are sequential and the next is
auto-derived from the highest already assigned.
