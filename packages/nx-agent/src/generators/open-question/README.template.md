# Open questions

Something undecided that can't be guessed at — needs input, a decision, or more information before
work depending on it can proceed.{{SHARED_CONTEXT_NOTE}} One file per question, so listing this
folder (cheap — just filenames) is enough to see what's still open.

Add one with `nx g @abgov/nx-agent:open-question "<what's undecided>" --project-docs-ancestors <path>
...` — don't hand-author files here, so the frontmatter shape stays consistent. Each file:

    ---
    project-docs-ancestors: [requirements:reviewer-role]
    resolves: []
    ---

    Which role(s) are allowed to review a submitted collision report? The intake form doesn't
    specify, and no existing requirement names one.

- `project-docs-ancestors` — whatever this question grounds on (a requirement, a service
  description, another artifact) — resolved from an existing artifact's path via
  `--project-docs-ancestors <path>`, not typed by hand.
- `resolves` — always present, empty here. Only an artifact that _resolves_ this question (via its
  own `--resolves` flag) writes an entry naming it — never edit this file to mark it resolved
  yourself; that's how a question resolved in prose elsewhere and never updated here happens.

A question is resolved by another artifact adding it via `--resolves` when that artifact settles it
— not by hand-editing this file. Run `nx g @abgov/nx-agent:project-docs-lineage` to see which open
questions are still open versus resolved.
