---
term: Pinned repository
aliases: [the pinned source repository]
not_confused_with: [resolved source, fetch cache, a caller-supplied source path]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

The single harness source repository this installer carries as a constant, with no option that
points it somewhere else.

It is a **constant rather than a parameter**, and that is the whole of its meaning. Because the
fetch cannot be redirected, access to this one repository is what the installer's trust boundary
actually is — the same boundary that already governs obtaining the harness by any other means,
including the hand-copying this capability replaces. A caller-supplied repository would move that
boundary to whatever the caller named, at which point an authenticated fetch would guarantee
nothing about whose code gets imported, spawned, and installed as a commit hook.

Distinguish it from a **resolved source**, which is one materialization of this repository at one
commit; from the **fetch cache**, a machine-local convenience that may hold several and is never
itself placed; and from **a caller-supplied source path**, which is a different route with a
different and weaker basis for trust — a local tree carries the caller's own authority and not this
repository's identity, whatever it declares about itself.
