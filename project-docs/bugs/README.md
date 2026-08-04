# Bugs

Something already built isn't behaving as designed — reported from outside the DDDD (Discover/
Design/Develop/Deploy) workflow (a user, QA, support), not raised internally by a later pipeline
stage the way a `blocker` is. One file per bug, so listing this folder
(cheap — just filenames) is enough to see what's currently wrong.

Add one with `nx g @abgov/nx-agent:bug "<what's wrong>" [--project-docs-ancestors <path to the
implicated requirement/design, if already known>]` — don't hand-author files here, so the
frontmatter shape stays consistent. Each file:

    ---
    project-docs-ancestors: []
    resolves: []
    ---

    Submitting the collision report form on a slow connection appears to do nothing — no error, no
    confirmation. Expected: either a success confirmation or a visible error.

- `project-docs-ancestors` — the requirement/design this bug's behavior traces to, if already known.
  Genuinely, often left empty: a bug reported from outside the system frequently doesn't know which
  artifact (if any) is at fault until Develop investigates it — resolved from an existing artifact's
  path via `--project-docs-ancestors <path>` when it is known, never typed by hand.
- `resolves` — always present, empty here. A `bug` doesn't resolve other artifacts (see
  `open-question`/`blocker`'s own convention — same shape, same reasoning).

**Not the same thing as a `blocker`.** A `blocker` is raised internally, by a later pipeline stage
that's already working inside a specific artifact's context, and is resolved by _revising that
artifact_. A bug is often a pure implementation defect where nothing about the design is wrong at
all — resolved by a code fix, via an `iteration-retrospective`'s own `--resolves` once that fix
lands, not by revising an upstream artifact. Investigation _can_ conclude the spec itself was wrong,
in which case file a real `blocker` against the implicated artifact — but filing that blocker does
not itself resolve the bug; the bug stays open until the actual fix's retrospective resolves it.

Run `nx g @abgov/nx-agent:project-docs-lineage` to see which bugs are still open versus resolved.
