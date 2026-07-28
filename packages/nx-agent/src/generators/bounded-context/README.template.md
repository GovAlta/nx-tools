# Bounded contexts

The boundaries within which this project's domain vocabulary and model apply — the same word can
mean something different once you cross into another context, so keeping each one's boundary
explicit is what keeps a domain term's meaning unambiguous.{{SHARED_CONTEXT_NOTE}} One file per
context, so listing this folder (cheap — just filenames) is enough to see the whole map before
adding a new one.

Add a context with `nx g @abgov/nx-agent:bounded-context <name>` — don't hand-author files here, so
the frontmatter shape stays consistent. Each file:

    ---
    name: Collision Reporting
    aliases: []
    not_confused_with:
      - term: Case Management
        reason: Case Management spans multiple contexts; Collision Reporting is one narrow slice of it.
    ---

    Everything from intake of a collision report through its initial triage. Excludes the
    downstream investigation and resolution workflow, which belongs to Case Management.

- `name` — the canonical name, matching the filename.
- `aliases` — other words or abbreviations that mean the _same_ context.
- `not_confused_with` — similarly-named contexts this one is deliberately distinct from, and why.
  Leave it empty if there's no real ambiguity to guard against.

The body is free text — describe what's inside the boundary and, just as importantly, what's
explicitly outside it and belongs to a different context instead. A domain term
(`nx g @abgov/nx-agent:domain-term ... --project-docs-ancestors <this-file>`) should normally derive
from the bounded context its meaning depends on.
