---
term: Target
aliases: []
not_confused_with: [resolved source, workspace]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

The directory a placement writes into, and the project that directory becomes.

A target has three states this domain cares about. Two of them decide which command acts at all;
the third decides nothing by itself, which is what makes it the subtle one:

- **empty of harness** — no harness directory. The case first placement is for.
- **carries the harness** — a harness directory is present. Placement refuses and names the update
  path; the update path is the one that acts.
- **carries files of its own but no harness** — the state most easily got wrong, and not
  categorically a refusal. It is a placement target, *unless* one of those files sits at a path the
  declared set carries: writing over a file the installer did not place destroys content it has no
  claim to. So the refusal is keyed on collision, path by path, not on the directory being
  non-empty. It is never an update target, because there is nothing to merge into.

Its **shape** is a separate question from its state, and decides who wires the organizational
floor: whether it carries a package manifest, and whether it is a workspace. All four combinations
occur, and the two facts are not interchangeable.

Not to be confused with the resolved source, which is read and never written, or with a workspace,
which is one shape a target may have.
