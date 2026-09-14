---
term: Candidate source
aliases: [candidate]
not_confused_with: [resolved source, pinned repository]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

A tree that might be a harness source, before the identity check has judged it.

The distinction exists because of what the check means: per `domain-terms:resolved-source` a tree
that fails it was never a resolved source at all. So the thing being judged needs its own name, or
the sentence "a resolved source that fails the identity check" has to be written, which describes
something that cannot exist.

Every route produces a candidate first: a fetched tree is a candidate until it declares itself the
pinned repository, and so is a tree a caller names with a path. Resolution *is* the
candidate-to-resolved transition, which is why nothing downstream re-checks identity — by the time
a resolved source exists, the question has been answered.

The two routes differ in what the check is worth on them, not in whether it runs. On a fetch it is
a real control, because the fetch cannot be redirected. On a caller-supplied path it is a
wrong-path guard: the declaration is part of the tree being judged, so it catches a mistake and not
a hostile tree.
