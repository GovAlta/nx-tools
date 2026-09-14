---
name: Harness placement
project-docs-ancestors:
  - bounded-contexts:harness-installation
  - domain-terms:declared-distribution-set
  - domain-terms:resolved-source
  - domain-terms:target
  - domain-terms:placement
  - domain-terms:pinned-repository
  - requirements:place-the-harness-from-the-declared-distribution-set
  - open-questions:what-trust-control-applies-to-code-executed-from-the-resolved-source
resolves: [open-questions:what-trust-control-applies-to-code-executed-from-the-resolved-source]
---

## The aggregate

**Placement** is the aggregate root: one act, against one target, from one resolved source. It has
no identity that outlives the act — what outlives it is the provenance record, which belongs to a
sibling model. Placement either completes or writes nothing.

## Value objects

**Resolved source** — a tree on disk plus the commit it resolves to, which has already been
established to declare itself the pinned repository. Per the term's own definition that declaration
is constitutive, so a tree failing the check was never a resolved source: what the identity check
judges is a *candidate*, and invariant 6 below refuses it before placement has an input at all.

**Declared distribution set** — the source's own declaration, applied to the source's tracked
files. It is derived, never stored: this model holds no list of paths and no opinion about their
contents.

**Target state** — *empty of harness*, *carries the harness*, or *carries files of its own but no
harness*. The first two decide which command acts. The third decides nothing by itself: it is a
placement target unless a file sits at a path the declared set carries, so the refusal is keyed on
collision path by path. Refusals in this boundary are keyed on target state **and** on the
candidate source — three of the five are source-keyed, not target-keyed.

Target *shape* — manifest presence and workspace-ness — is deliberately not modelled here. It is
the input to floor wiring, whose requirement is not an ancestor of this model; it lives in the
`target` term as a fact about a target and is designed against in its own pass.

## Invariants

1. **Placement acts only on a target empty of harness, and only where it would write no file it did
   not place.** Traces to the rules refusing an occupied target and refusing a pre-existing file at
   a declared path.
2. **The file universe is the source's tracked files intersected with the source's declaration.**
   Untracked and ignored content can never travel — which is a leak control as much as a
   determinism one, since ignored files in a working clone are where credentials sit.
3. **The declaration is read from the resolved source at the time of the act.** A copy of it held
   here would be the defect this capability exists to remove.
4. **Every written path is confined to the target.** The declaration is content from a resolved
   source, so an absolute path, an upward traversal, or a symlink leaving the target is a refusal.
5. **The execute bit travels and nothing wider does.** Placement installs an executable that runs
   on a developer's machine at every commit; that is intended, and it is why invariant 6 exists.
6. **All preconditions are established before the first write.** An unreadable declaration, a
   mismatched candidate-source identity, an occupied target, a collision at a declared path, an
   unconfined path — each is refused with an untouched target rather than discovered part-way
   through.

   This is precondition checking, **not atomicity**, and the difference is worth stating because it
   is easy to claim more: an I/O failure at file N of M leaves the first N written. No rule requires
   all-or-nothing, and this model does not provide it; what it provides is that no *refusal* ever
   leaves a partial tree. Making the write itself atomic would mean staging and renaming, and that
   is a rule to add in Discover if it is wanted, not a property to assume here.

## Where these live in code

Invariants 2, 3 and 4 are **pure functions** and belong in testable core logic: `(tracked paths,
declaration) → the set` and `(target root, candidate path) → permitted or refused`, neither of
which needs a filesystem or a network to exercise. Invariant 1 is a predicate over target state,
also pure given that state. The command layer stays thin — argument parsing, exit codes, and
output — and owns none of the above.

## The trust control over code from a resolved source

This model resolves
`open-questions:what-trust-control-applies-to-code-executed-from-the-resolved-source`.

Placement executes code that came from the resolved source, on purpose and in more than one way:
it applies the source's own declaration rather than a carried copy, and it installs a hook that
then runs locally at every commit. A sibling model spawns the source's own update tool for the
same reason.

**The decision: access to the pinned repository is the trust boundary, and there is no further
control.** No signature verification. Three things make that a position rather than an omission:

- The **same boundary already governs obtaining the harness by any means**, including the
  hand-copying this capability replaces. The installer grants no authority that access did not
  already carry.
- The **repository is pinned, with no option to redirect it**, which is what makes the point above
  true instead of merely stated. A caller-supplied target would move the boundary to whatever the
  caller named, and an authenticated fetch would then guarantee nothing.
- The **resolved commit is recorded**, so any placement is attributable to an exact tree after the
  fact. That half is delivered by the provenance requirement, outside this one.

**The scope of the decision is the fetch route, and the local-path route is not bounded by it.**
An earlier draft of this section claimed the identity check bounds that route once the expected
identity is a constant. It does not, and the open question said so before this model was written:
the declaration is part of the tree being judged, so a hostile tree declares whatever it likes.
Pinning fixes what the check compares *against*, which matters for a fetch because a fetch cannot
then be redirected; on a local path it makes the check a wrong-path guard and nothing more.

What bounds the local-path route is the caller's own authority: anyone who can write a tree on the
machine and induce a caller to point at it can already execute code there, so the route grants
nothing new. That is why the route stays open and why the check on it is not being asked to carry
weight it cannot.

**One residual risk, accepted rather than mitigated:** an agent handed a path is not the same actor
as a human choosing one, and this control does not distinguish them. If that becomes unacceptable,
the mitigation is a restriction on where a source may be resolved from at all — the option this
decision declined — not a stronger identity check.

**What none of it buys:** a compromise of the pinned repository is a compromise of every project
placed from it. That is inherent in distribution by copy and is not worsened here, but it is not
addressed either, and a verified signature is the thing that would address it if the source
repository ever signs.
