# Domain models

The actual design — aggregates, entities, value objects, invariants — built from the vocabulary and
boundaries this project has already established.{{SHARED_CONTEXT_NOTE}} One file per model, so
listing this folder (cheap — just filenames) is enough to see what's been designed before adding to
it.

Add a model with `nx g @abgov/nx-agent:domain-model <name> --project-docs-ancestors <path> ...` —
don't hand-author files here, so the frontmatter shape stays consistent. Each file:

    ---
    name: Collision Report Lifecycle
    project-docs-ancestors: [bounded-contexts:collision-reporting, domain-terms:collision-report]
    ---

    A CollisionReport aggregate, keyed by its report id, moving through Intake -> Triage ->
    Closed. Triage requires an assigned reviewer; Closed requires a resolution code.

- `name` — the canonical name, matching the filename.
- `project-docs-ancestors` — the bounded context this model belongs to and the domain terms it's
  composed from. Set with `--project-docs-ancestors <path>` at creation time, not by hand — see
  `nx g @abgov/nx-agent:project-docs-lineage`'s own guidance for the full reference convention.

The body is free text — the actual design. Keep it current: when the model changes (a new
invariant, a renamed aggregate), update its file rather than letting the answer live only in the
code that happens to implement it today.
