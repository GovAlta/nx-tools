---
project-docs-ancestors: [product-briefs:keystone-installer]
resolves: []
---

This package executes code that came from the resolved source, in three places, each deliberately:
it reads the source's own distribution predicate rather than carrying a copy of it; it spawns the
source's own upgrade tool rather than reimplementing merge rules; and it places an executable hook
that then runs on the developer's machine at every commit.

Every one of those is the right design for the defect this package exists to fix — a carried copy
of someone else's rules is exactly what went stale in the hand-written installers. But together
they mean a fetched ref, or a caller-supplied path, becomes code that runs locally, and the only
control today is implicit: the fetch is authenticated against a private repository, and the commit
it resolved to is recorded.

The identity check on the resolved source is not this control and should not be mistaken for it.
It compares what a tree declares itself to be against what was asked for, which catches a wrong
path; the declaration is part of the tree being judged, so it cannot catch a hostile one.

So the question is what, if anything, should be required beyond an authenticated fetch:

- nothing further, with the reasoning written down so the position is deliberate rather than
  unexamined — private-repository access is already the trust boundary for obtaining the harness by
  any means, including the hand-copying this replaces;
- a verified signature on the tag or commit being placed;
- a restriction on where a source may be resolved from at all, which would bear on whether the
  local-path route stays unbounded.

Not guessable. The first option may well be right, and it is cheap — but it is a security posture
for a government workstation tool, so it needs stating by someone who owns that call rather than
being settled by the absence of a rule. It does not block implementation: whichever way it goes,
the resolved commit is recorded either way.
