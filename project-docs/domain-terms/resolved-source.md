---
term: Resolved source
aliases: [source]
not_confused_with: [the pinned repository, the fetch cache]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

A harness tree on disk, the commit it resolves to, and a live handle to the source's own travel
predicate — obtained either by fetching the one pinned repository or by being given a local path.

All three matter. The tree is what gets read and placed; the commit is what makes the placement
describable afterwards, which is why a moving reference is resolved against the remote and the fixed
commit is what gets recorded.

**The predicate is a handle to the source's own code, not a copy of its declaration**, and the
distinction is the whole of why carrying it here is allowed. `domain-models:harness-placement`'s
invariant 3 forbids this package holding a copy of what travels; loading the source's own function
and passing the reference along *is* reading the declaration from the resolved source at the time of
the act. A list of paths, or this package's own re-implementation of how that list matches, would be
the forbidden thing.

It is **not** the pinned repository, which is an identity this installer carries and cannot be
redirected to point elsewhere; a resolved source is one materialization of that repository at one
commit. It is also not the fetch cache, which is a machine-local convenience that may hold several
and is never itself placed.

A tree is only a resolved source if it declares itself to be the pinned repository — before that
judgement it is a `domain-terms:candidate-source`, which is why nothing downstream re-checks
identity.

**What that check is worth differs by route, and an earlier version of this paragraph got it
wrong.** On a fetch it is a real control, because the fetch cannot be redirected. On a
caller-supplied path it is a wrong-path guard and no more: the declaration is part of the tree being
judged, so a hostile tree declares whatever it likes. What bounds the local route is the caller's
own authority.
