---
title: Resolve the harness source from a local path or a fetched ref
id: req-006
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: an explicitly given local path is used as the source, and the commit it resolves to is reported on the run's own output
    examples:
      - "Given: a local clone of the harness at a known commit;
         When: init runs against that path as its source;
         Then: placement uses that tree, and the run prints the commit it resolved"
    questions: []
  - rule: the local-path route reaches no network and reads no credential
    examples:
      - "Given: a machine with no access to the source repository and no network;
         When: init runs against a local path as its source;
         Then: it completes, because nothing on this route contacts a remote or reads a credential"
    questions: []
  - rule: a local source whose own state makes its recorded commit hard to fetch is reported, not refused
    examples:
      - "Given: a local source with uncommitted changes, or whose branch is ahead of its
         remote-tracking ref, or which has no upstream at all;
         When: init places from it;
         Then: the placement proceeds and the run states that the recorded commit may not be one
         anyone else can fetch — because whether that matters is the caller's judgement, and
         refusing a placement they explicitly asked for was a policy this installer chose rather
         than anything the capability needs"
      - "Given: the same source;
         When: the run reports;
         Then: the report is made from what is on disk, which can be stale in both directions,
         since reaching a remote to be certain would cost the no-network property this route
         exists for"
    questions: []
  - rule: a fetch resolves a moving reference against the remote and records the fixed commit rather than the reference
    examples:
      - "Given: no ref is specified, and a cache from an earlier run that is behind the remote;
         When: init fetches;
         Then: the default branch is resolved against the remote rather than the cache, and the
         commit it resolves to is what gets recorded"
    questions: []
  - rule: an explicit ref is honoured whether it names a tag, a branch, or a commit
    examples:
      - "Given: a ref naming a release tag older than the source's current default branch;
         When: init fetches with that ref;
         Then: the placed tree is the tagged one"
      - "Given: a ref naming a commit directly;
         When: init fetches with that ref;
         Then: the placed tree is that commit, and the recorded ref and recorded commit agree"
      - "Given: a ref given together with a local source path;
         When: init runs;
         Then: it refuses as a usage error, because a ref selects among the pinned repository's
         commits and says nothing about which commit a local tree is on"
      - "Given: a ref that the pinned repository does not have;
         When: init fetches with it;
         Then: it exits non-zero naming that ref as unknown to the repository, rather than
         reporting it as an access problem — the two are indistinguishable in the underlying
         tool's own output and are different problems for the caller"
    questions: []
  - rule: the fetch uses the canonical remote for the source repository rather than any remote a clone in play happens to be configured with
    examples:
      - "Given: a clone on this same machine whose configured remote uses a host alias, and a fetch
         run in that same environment;
         When: init fetches;
         Then: it contacts the canonical remote, so the run does not depend on an alias that exists
         on one machine"
    questions: []
  - rule: a failed fetch names the access actually required instead of surfacing the underlying tool's error
    examples:
      - "Given: an environment with no access to the source repository;
         When: init fetches;
         Then: it exits non-zero naming the access needed and how to obtain it, rather than printing
         a transport error"
      - "Given: a fetch that fails for a reason nothing anticipated;
         When: init reports it;
         Then: it relays the underlying failure rather than asserting a diagnosis it cannot
         support, and relays it redacted — a confident wrong diagnosis is worse than an honest
         unknown, and an unredacted relay is how a credential reaches a log"
    questions: []
  - rule: the fetched repository is a fixed identity this package carries, with no option to redirect it
    examples:
      - "Given: any invocation;
         When: init fetches;
         Then: it fetches the one repository this package names, and there is no option that points
         the fetch somewhere else"
    questions: []
  - rule: a resolved source that does not declare itself to be that repository is refused, on both routes
    questions: []
    examples:
      - "Given: a local path pointing at a tree that is not the harness;
         When: init runs against it;
         Then: it exits non-zero on the mismatch between what the tree declares itself to be and the
         repository this package names, and writes nothing"
      - "Given: a fetched tree that declares some other repository;
         When: init resolves it;
         Then: it is refused for the same reason and by the same check, since the expected identity
         is a constant rather than an echo of what was asked for"
  - rule: a fetched source is cached, and reuse of the cache is observable
    examples:
      - "Given: a previous run already fetched the source;
         When: init runs again against the same repository;
         Then: the run reports that it reused and updated the existing cache rather than cloning
         afresh, and the cache directory's identity is unchanged"
    questions: []
questions: []
---

## Rationale

Placement needs a source tree, and there are two ways to have one: a maintainer's local clone, and
a fetch of a specific ref. Which is the default is a decision that has already changed once, so
neither can be entangled with placement.

A third route — content carried inside the package — is a stated future direction and deliberately
not in scope here, because it is the opposite of what this package currently guarantees about its
own contents.

Two of them are also the only route to verifying any of this. A local path is what makes the
behaviour testable in a public CI that cannot reach the source repository, and it is what a
maintainer bootstrapping from uncommitted work actually needs.

The repository itself is not a parameter. Pinning it is what makes access to that private
repository the actual trust boundary for the code this package goes on to execute — an imported
predicate, a spawned upgrade tool, a placed hook that runs at every commit. A caller-supplied target
would move that boundary to whatever the caller named, and nothing needs it: the local-path route is
what serves testing and a maintainer's uncommitted work, so a redirectable fetch would be capability
added for no present purpose.

A fetch has failure modes a bare stack trace does not explain: no access to a private repository,
a ref that does not exist, an unauthenticated environment. The one credential actually required
has to be named at the point it is missing, because the alternative is a new person concluding the
package is broken.
