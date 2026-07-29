# Blockers

An existing artifact that needs revision — something already established but wrong, incomplete, or
in conflict with something discovered later.{{SHARED_CONTEXT_NOTE}} One file per blocker, so listing
this folder (cheap — just filenames) is enough to see what's currently blocking.

Add one with `nx g @abgov/nx-agent:blocker "<what needs fixing and why>" --project-docs-ancestors
<path to the artifact that needs revision>` — don't hand-author files here, so the frontmatter shape
stays consistent. Each file:

    ---
    project-docs-ancestors: [domain-models:collision-report-lifecycle]
    resolves: []
    ---

    The Closed state requires a resolution code, but the intake form doesn't collect one — this
    model can't be implemented as designed until that's added upstream.

- `project-docs-ancestors` — the artifact this blocker relates to, typically the one that needs
  revision — resolved from an existing artifact's path via `--project-docs-ancestors <path>`, not
  typed by hand.
- `resolves` — always present, empty here. Only an artifact that _resolves_ this blocker (via its own
  `--resolves` flag) writes an entry naming it — never edit this file to mark it resolved yourself;
  that's how a blocker resolved in prose elsewhere and never updated here happens.

A blocker is resolved by another artifact adding it via `--resolves` when that artifact's revision
actually addresses it — not by hand-editing this file. Run `nx g @abgov/nx-agent:project-docs-lineage`
to see which blockers are still open versus resolved.
