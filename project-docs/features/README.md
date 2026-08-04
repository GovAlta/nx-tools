# Features

How new work enters the DDDD (Discover/Design/Develop/Deploy) workflow — a capability someone wants,
written down before anyone's decided what it actually requires. One file per
feature request, so listing this folder (cheap — just filenames) is enough to see what's been asked
for.

Add one with `nx g @abgov/nx-agent:feature "<title>" [--project-docs-ancestors <path> ...]
[--resolves <path> ...]` — don't hand-author files here, so the frontmatter shape stays consistent.
Each file:

    ---
    title: Submit Minor Collision Report
    project-docs-ancestors: []
    resolves: []
    ---

    Drivers need a lightweight way to report a minor collision (no injuries, both parties agree on
    fault) without going through the full incident-report flow meant for serious collisions.

- `project-docs-ancestors` — an existing artifact this feature relates to, typically the
  service-description it extends if one already exists for this initiative. Omit entirely for a
  brand-new initiative with nothing yet to reference — resolved from an existing artifact's path via
  `--project-docs-ancestors <path>`, never typed by hand.
- `resolves` — which of those ancestors (typically an `open-question`/`blocker`) this feature
  specifically _resolves_, not just builds on — set via `--resolves`, a distinct flag from
  `--project-docs-ancestors` even though the same ref also lands there.

The body is free text — the capability wanted, written the way it was actually asked for, not
pre-structured. Discover's own "which mode" logic picks this up (a feature with no
requirement/service-description descendant yet) and decomposes it from there — this file is the
input to that process, not the output.
