---
name: Source resolution
project-docs-ancestors:
  - bounded-contexts:harness-installation
  - domain-terms:resolved-source
  - domain-terms:pinned-repository
  - domain-terms:fetch-cache
  - domain-terms:requested-ref
  - domain-terms:candidate-source
  - requirements:resolve-the-harness-source-from-a-local-path-or-a-fetched-ref
resolves: []
---

Resolution is the act that turns a **candidate source** into a **resolved source** — a tree, the
commit it sits at, and a live handle to the source's own travel predicate, in the sense
`domain-terms:resolved-source` now defines: a handle to the source's code, never a copy of its
declaration. `domain-models:harness-placement` consumes that value and never produces one, which is
why this is a separate model over the same bounded context.

## The aggregate

**Resolution** is the aggregate root. Like placement it has no identity outliving the act — what
outlives it is the resolved source it yields and, through a sibling model, the provenance recorded
about it.

Exactly **two routes** reach a resolved source, and they differ in more than mechanism:

| | **Local path** | **Fetch** |
|---|---|---|
| where | a path the caller names | the pinned repository, and nowhere else |
| network | none | required |
| credential | none read | supplied by the machine's git credential helper |
| what bounds it | the caller's own authority | access to the pinned repository |
| verifiable in a public CI | yes | no |

That last row is why the routes cannot be collapsed: the local route is the only one a test in this
repository can exercise, and it is also what a maintainer bootstrapping from uncommitted work
needs.

## Value objects

**Requested ref** and the **resolved commit** it produces, which are recorded separately because a
ref can move.

**Candidate source** — see `domain-terms:candidate-source`. Resolution's job is precisely the
candidate-to-resolved transition, so nothing downstream re-checks identity.

That the *refusal* is catalogued with placement's refusals in the command's contract is a
presentation choice, not divided ownership: the check belongs to this model, and it appears there
because a caller meets every refusal of one command in one table.

**Local acceptance** — whether the caller explicitly accepted a source with local modifications.
It is part of the outcome rather than a flag consumed and discarded, because a copy placed from an
unpushed commit is not reproducible by anyone else and a later reader has to be able to see that.

## Invariants

1. **The repository is a constant, not a parameter.** There is no option that redirects the fetch.
   This is what makes access to that one repository the trust boundary rather than a claim about
   one (see `domain-terms:pinned-repository`).
2. **A resolved source has declared itself to be that repository.** On the fetch route this is a
   real control, because a fetch cannot be pointed elsewhere. On the local route it is a wrong-path
   guard and nothing more — the declaration is part of the tree being judged.
3. **A moving reference is resolved against the remote**, never against the cache, and the fixed
   commit is what is recorded.

   **Naming the canonical URL is not sufficient to use it, and neutralising the rewrite is not
   possible.** `url.<base>.insteadOf` rewrites URLs globally — which is how a maintainer's SSH host
   alias is configured, the very configuration rule 6 exists to defeat, so the rule would fail on
   the machine that motivated it. But a rewrite cannot be cleared for one invocation: `-c
   url.X.insteadOf=` does not unset it, it sets the match prefix to the empty string, which matches
   every URL (measured: that "neutralisation" redirected every fetch to github.com). Excluding the
   global config wholesale would work and would also drop the credential helper, which lives in the
   same file and is what authenticates the fetch.

   So the rewrite is **verified rather than prevented**: the effective URL is resolved and checked
   to still *designate* the pinned repository. Transport may differ — an SSH alias reaching the same
   repository is how a maintainer's machine authenticates, and refusing that would make this route
   unusable for exactly the people who configured it. A different repository is the hazard, and it
   refuses. **The check runs inside the directory the fetch runs in**, since a rewrite in that
   directory's own local config is one git will honour and a check elsewhere would not see.
4. **The local route touches neither network nor credential.** Not an optimisation: it is what
   makes the behaviour testable where the fetch cannot run, so anything that reads a credential or
   contacts a remote before the route is chosen breaks it.
5. **A local source with uncommitted or unpushed work is refused unless accepted explicitly, and
   the acceptance is carried forward.** Unpushed matters as much as dirty and is easier to miss: a
   commit nobody else can fetch makes the recorded provenance unresolvable for everyone but this
   machine.

   **How "unpushed" is established is the whole difficulty, and it is bounded by invariant 4.**
   Whether a commit is on a remote is a fact about the remote, and this route may not ask one. So
   it is judged against the remote-tracking ref already on disk, which can be stale in both
   directions — and the refusal says so rather than implying certainty. A branch with no upstream
   at all is a third state and refused on its own terms. Reaching the remote to be sure would cost
   the property that makes this route the testable one; a stale answer that states its basis is the
   better trade, and the requirement now says which.
6. **No credential is ever held, written, or printed by this act** — see the discussion below,
   which is the mechanism rather than a promise.
7. **A failure names the access required, not the tool's error.** A transport failure that reaches
   the caller verbatim tells a new person the package is broken.

## Where these live in code

The route decision, the ref-versus-commit distinction, and the refusal predicates are pure
functions over gathered facts: `(dirty, unpushed, accepted) → refusal or null` needs no repository
to exercise, and neither does the diagnosis that turns a failure into a remediation. What must do
I/O is narrow — run git, read a manifest, import the source's predicate module.

## Reading the predicate is executing the source's code

Resolution loads the source's own predicate module, which means **resolution runs code from the
resolved source** — on both routes, and under a plan as much as a real placement.
`domain-models:harness-placement`'s trust decision sanctions this (the pinned repository is the
trust boundary; a local path carries the caller's own authority), but it is worth stating here
rather than inheriting silently, because the obvious reading of a plan is that it is inert and it
is not.

The mechanism is not free either. The module is ESM in a foreign tree, so a CommonJS build cannot
`require` it and a compiler that downlevels `import()` has to be worked around; and a source whose
module cannot be loaded, or which exports no whole-question predicate, is refused rather than
answered on its behalf.

## The credential: not handled, which is how invariant 6 holds

**This model reads no token.** The fetch is a `git` operation over HTTPS against the plain
repository URL, and authentication is supplied per-operation by whatever credential helper the
machine already has configured. Nothing in this boundary asks for, receives, stores, or forwards a
secret.

That is a deliberate divergence from the pattern this suite already uses elsewhere, and the
difference is worth recording because the other pattern is the more obvious one to copy. An
existing executor in this suite reads `gh auth token` and parses `gh auth status` for the active
account's scopes — correctly, because it needs the token as a **value**: it hands it to a container
registry login and mints a cluster secret from it. Resolution needs no value, only an
authenticated git operation, and git can do that itself.

What this buys is that three of the four rules in
`requirements:never-persist-or-emit-the-source-credential` become structural rather than
aspirational: nothing in the provenance record, nothing in the cache's configuration, nothing
inherited by a delegated tool, all because there is no secret in this process to leak. A design
that read a token would have to earn each separately, and any one could regress silently.

**The fourth rule is not structural, and claiming it was is this model's own error.** "Nothing in
diagnostic output" does not follow from holding no secret, because the secret does not have to be
in *this* process: the standard ways a credential reaches git put it where git's own stderr echoes
it — a remote of the form `https://x-access-token:<token>@github.com/…`, or an
`http.extraheader` carrying an `Authorization` value, which is precisely how a CI runner wires
GitHub access. Any failure this boundary relays can therefore carry a secret it never read.

So that rule is earned by a mechanism rather than by construction: **anything relayed from an
underlying tool is redacted first** — credentials in URL userinfo, and header-shaped values —
by a pure function over the text, which is the one part of this that a test can pin exactly.

What it costs is that this boundary cannot *pre-check* authorization the way that executor does
before a slow build. Here the fetch is the operation, so the honest shape is to attempt it and
diagnose a failure — is the tool present, is any account authenticated, is git wired to use it —
and turn that into the one remediation the caller needs. Invariant 7 is that diagnosis, not a
guard before the fact.
