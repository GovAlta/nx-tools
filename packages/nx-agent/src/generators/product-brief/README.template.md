# Product briefs

Persistent product positioning artifacts — one per capability, anchored to the feature(s) that
founded it. Each brief captures what the capability is for, who it is for, the operating context
it runs within, and open positioning questions. It is the root ancestor for requirements and is
referenced (never re-created) when extending the same capability from additional features.

Add a brief with `nx g @abgov/nx-agent:product-brief "<Name>"` — don't hand-author files here,
so the frontmatter shape stays consistent. Each file:

    ---
    capability: Lineage Graph
    audience: [AI coding agents navigating the DDDD workflow, nx-agent generator implementations]
    known-platforms: [nx-agent]
    questions: []
    project-docs-ancestors: [features:<feature-slug>]
    resolves: []
    ---

- `capability` — the canonical name of the capability, matching the filename.
- `audience` — who uses or is affected by this capability (roles, actor types).
- `known-platforms` — existing systems/platforms this capability must operate within or integrate
  with (e.g. `adsp`). Facts about the operating context, not a design decision. If genuinely
  unknown, add a `questions` entry.
- `questions` — open positioning questions that span the whole brief (not specific to one rule).
- `project-docs-ancestors` — the feature(s) that founded this brief. Set at creation time with
  `--projectDocsAncestors`; append additional features directly rather than regenerating.

The body is free text — product positioning: what this capability is for, who it is for, and
what problem it solves. Scope statements here feed directly into bounded-context boundary
descriptions.
