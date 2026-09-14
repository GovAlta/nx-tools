---
term: Requested ref
aliases: [ref]
not_confused_with: [resolved commit, pinned repository]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

What a caller asked for: a tag, a branch, a commit, or nothing at all.

Distinguished from the **resolved commit** it produces, and the distinction is the point rather
than pedantry. A requested ref can move: `main` means a different tree next week, and a caller who
records the ref has recorded a question rather than an answer. The resolved commit is what a later
reader needs in order to know what a project actually received.

So both are recorded and they are not interchangeable — the ref says what was asked for, the
commit says what arrived. A tag that is later moved, or a branch that advances, leaves the pair
disagreeing, and that disagreement is information rather than an inconsistency to reconcile.

Absent, it means the pinned repository's default branch, resolved the same way: against the remote,
producing a commit.

Not to be confused with the pinned repository, which is *where* rather than *which* — the
repository is a constant this installer carries and a ref selects among that repository's commits.
