# Iteration retrospectives

A close-out record for a single iteration's pass — what it did, what was found and fixed along the
way, and an explicit status when "deployment succeeded" and "verified working end-to-end"
diverge.{{SHARED_CONTEXT_NOTE}} One file per pass, so listing this folder (cheap — just filenames) is
enough to see what's already been closed out.

Not the same thing as a periodic, cross-iteration review that reads back across many of these to
find drift a single pass can't see on its own — that's a separate, standing process a team runs on
its own cadence. This folder holds the per-iteration records that process would read, not the
process itself.

Add one with `nx g @abgov/nx-agent:iteration-retrospective "<title>" --project-docs-ancestors <path>
...` — don't hand-author files here, so the frontmatter shape stays consistent. Each file:

    ---
    title: Submit Minor Collision Report
    project-docs-ancestors: [requirements:submit-minor-collision-report]
    resolves: []
    ---

    Implemented the submit-minor-collision-report flow end to end. Revised
    domain-models:collision-report-lifecycle with invariants 5-7 while doing so. Deployed and
    verified working against a real sandbox.

- `project-docs-ancestors` — every artifact this pass substantively created, revised, or touched —
  not just the requirement it nominally closes out. Resolved from an existing artifact's path via
  `--project-docs-ancestors <path>`, not typed by hand; name domain models and designs the pass
  actually changed here too, not only the requirement.
- `resolves` — any open-question/blocker this pass settled, via `--resolves <path>` on the same
  invocation. Always present, empty if nothing was resolved.

A correctly-closed-out retrospective has zero descendants forever — nothing is ever expected to
build on a close-out record — so it's excluded from `project-docs-lineage`'s orphan report rather
than flagged alongside a genuine dead-end.
