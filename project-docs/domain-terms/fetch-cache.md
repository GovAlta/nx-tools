---
term: Fetch cache
aliases: [cache]
not_confused_with: [resolved source, target, pinned repository]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

A machine-local clone of the pinned repository, kept between runs so a second fetch updates rather
than clones afresh.

It is **not a resolved source** and is never placed from directly as a matter of identity: a
resolved source is the cache at one commit, and the cache may sit at a different commit tomorrow.
Nor is it the target: nothing a project receives comes from the cache's own metadata.

Two properties matter enough to state, because both are easy to get wrong in the same direction —
by trusting the cache:

- **A moving reference is resolved against the remote, not against the cache.** A cache that has
  not been updated names a stale commit, and resolving a branch locally would place yesterday's
  tree while reporting today's branch name.
- **The cache holds no credential.** It is a clone whose remote is the plain repository URL;
  authentication is supplied per-operation by the machine's own git credential helper and is never
  written into the cache's configuration. A cache outliving the run that made it must not outlive
  a secret.

Its reuse is reportable rather than silent, because "this run fetched" and "this run reused what
was already here" are different facts about where a placed tree came from.
