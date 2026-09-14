---
title: Source resolution implemented and both routes verified
project-docs-ancestors: [product-briefs:keystone-installer, requirements:resolve-the-harness-source-from-a-local-path-or-a-fetched-ref, domain-models:source-resolution, cli-designs:keystone-init]
resolves: []
---

Source resolution taken from design through to a verified run on both routes. The command now
works with no options at all — it fetches the pinned repository's default branch — and `--source`
remains for a clone already on disk.

## Status

**Both routes are verified end to end against the real private repository.** The fetch route
resolves the default branch, reports the cache as created then reused, honours `XDG_CACHE_HOME`,
and the placed tree's content hash equals the fetched cache's. The local route against a real clone
places the whole declared set and passes the reproducibility checks.

**The package still is not shippable.** The update path, the provenance record, floor wiring and
the handoff are undeveloped, and the placeholder publish that has to precede a trusted publisher
has not happened.

## The finding worth carrying forward

**Every one of the five bugs this pass's review reproduced was in the control added in response to
the *previous* review.** The last pass surfaced that naming a canonical URL does not stop a
`url.insteadOf` rewrite from redirecting a fetch. The fix for that was broken five separate ways:
the refusal never reached the caller, the check was evaluated against a different git
configuration from the one the fetch would use, its message leaked a credential, its supporting
diagnosis read the token the model promises is never held, and a related cache-repair path could
not repair. The gates were green throughout.

The generalisation is not "review more". It is that **a fix is not a verification**, and a control
written to answer a review is the code least likely to have been exercised — because the reasoning
that produced it feels like evidence. Concretely: both existing tests of the redirect control
passed an explicit working directory, and the production call site was the single shape neither
covered. That is the shape of gap to look for after any fix.

## Also found and fixed along the way

- Attempting to neutralise a rewrite with `-c url.X.insteadOf=` **created** one: an empty match
  prefix matches every URL, so it redirected every fetch to github.com. A rewrite cannot be cleared
  for one invocation at all, and excluding the global config would drop the credential helper that
  authenticates the fetch. Verification replaced prevention.
- The redaction function leaked the thing it existed to hide: `Authorization: Basic <value>` had
  only the scheme word matched, leaving the credential in place.
- `dirty` counted untracked files, which would have refused every ordinary clone. Untracked content
  cannot travel, because the declared set is drawn from the index.
- A detached checkout at a release tag read as "no upstream", was refused, and was then recorded as
  accepted-with-local-modifications — while being perfectly reproducible.
- Exit 3 was in the design's own table and never returned, so a write failure exited with the one
  status that promises an untouched target.
- The secret scanner blocked the commit over synthetic credential literals in the redaction tests.
  It was right to: it cannot tell synthetic from real, and the rule is never a literal value. They
  are assembled at run time now.

## What changed about the artifacts rather than the code

Two design statements were wrong rather than merely incomplete, and both were corrected from
measurement: that a rewrite could be neutralised, and that "no credential in diagnostic output"
followed for free from holding no credential. The second does not — git's own diagnostics echo the
credential it was given — so that rule is now earned by a redaction mechanism rather than claimed
by construction. The vocabulary also needed a pass: a term still asserted something both models had
repudiated, which is what a future reader meets first.
