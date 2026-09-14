---
title: "keystone init: placement contract"
project-docs-ancestors:
  - domain-models:harness-placement
  - domain-models:source-resolution
  - requirements:record-the-placed-harness-provenance-in-the-project
  - requirements:wire-the-organizational-floor-by-deferring-to-the-workspace-generator
  - requirements:end-bootstrap-at-a-handoff-without-running-a-harness-command
  - requirements:delegate-upgrade-of-an-existing-copy-to-the-harness-upgrade-tool
  - requirements:ship-no-harness-content-in-the-published-package
  - requirements:never-persist-or-emit-the-source-credential
---

The interface point is the `keystone init` command. Its consumer is a developer at a terminal, or
an AI coding agent bootstrapping on their behalf — so the contract is the option surface, the exit
status, and the output, and every one of those is read by something that cannot ask a follow-up
question.

**This file is the package's contract, not one command's.** It covers `init` and `upgrade`, and
what the published artifact may contain. It currently covers *placement*
(`requirements:place-the-harness-from-the-declared-distribution-set`, req-005) and *source
resolution* (`requirements:resolve-the-harness-source-from-a-local-path-or-a-fetched-ref`,
req-006), plus provenance (req-008), floor wiring (req-009) and the handoff (req-010) in interface
points 8 to 10. Rules are cited as `req-NNN rule N`, never a bare rule number, because five
requirements are in play and a bare number is ambiguous across them.

**Those last three are named as ancestors directly, without a domain model of their own.** The two
models cover placement and resolution; req-008, req-009 and req-010 are each a further thing the
same command does once a source is resolved, and neither introduces an aggregate or an invariant
the existing models do not already carry. Naming them here is what makes the trace real — without
it the graph reported them as `unreferenced` while their code was written and shipped, which is a
traceability hole rather than a formality.

There is no UX design for this requirement. The consumer is human-facing but there is no
interaction surface with screens or navigation to design — a `route` and a `sitemap-position` would
describe nothing real. Per the design skill's step 7, the CLI's own option and output contract is
the artifact that fits.

## Invocation

```
keystone init [--target <dir>] [--ref <tag|branch|sha>] [--source <path>]
              [--accept-local-source] [--setup] [--json]
```

Both spellings of every value option are accepted — `--target <dir>` and `--target=<dir>` — and an
unrecognised option is a usage error rather than a silently discarded argument. That is not a
nicety: an implementation matching only the space-separated form placed into the working directory
when given `--target=<dir>`, and this command's own design says a placement into the wrong directory
is not undoable.

`--target` defaults to the working directory. There is deliberately **no option naming the source
repository**: it is a constant this package carries, which is what makes access to it the trust
boundary (see `domain-terms:pinned-repository`).

Every option is now specified: `--target`, `--plan` and `--json` by req-005, and `--ref`,
`--source` and `--accept-local-source` by req-006 in interface points 4 to 6 below.

**With neither `--source` nor `--ref`**, the command fetches the pinned repository's default
branch. That is the ordinary case and takes no options at all.

## Exit status

| Status | Meaning |
|---|---|
| `0` | the placement completed |
| `1` | **refused**, with the target not written to at all. Every row of every refusal table below, and every failure to resolve a source, exits `1` |
| `2` | **usage error**: an unknown option, a missing value, a conflicting pair, or a command that is not `init`. Distinct from a refusal because nothing about the target or the source was examined |
| `3` | **interrupted**: preconditions passed, writing began, and an I/O failure stopped it part-way. The target holds some of the declared set. Distinct from `1` precisely because `1` promises an untouched target and this cannot |

**The cache lives at a deterministic path**, `${XDG_CACHE_HOME:-~/.cache}/abgov-keystone/<owner>-<name>`,
so req-006 rule 10's "the cache directory's identity is unchanged" is something a test can assert
rather than an intention.

**What a non-zero status guarantees, precisely**: every precondition is established before the
first write, so a *refusal* never leaves a partially placed tree. It is not atomicity — an I/O
failure at file N of M leaves the first N written, is reported as such, and no rule requires
otherwise. See invariant 6 of the domain model.

## The output contract

Specified in one place because it accreted per interface point and the halves disagreed: the
refusal payload had literal text while the success path had none, and the JSON object gained a
field per section with nothing reconciling them.

### Streams

- **`--json`**: exactly one JSON object, on **stdout**, and nothing else on stdout. No human lines
  alongside it, for success or refusal. A payload interleaved with prose is unparseable and would
  satisfy every other sentence here.
- **Without `--json`**: the outcome on **stdout**, refusals and diagnoses on **stderr**.
- **Usage errors (exit 2)** print on stderr and emit **no JSON**, since nothing was examined and
  there is no outcome to describe.

### The payload, whole

```json
{
  "placed": true,
  "route": "fetch",
  "source": "GovAlta-EMU/keystone",
  "ref": null,
  "commit": "<40-hex>",
  "cache": "reused",
  "acceptedLocalModifications": false,
  "written": 519,
  "files": ["AGENTS.md", "..."]
}
```

| Field | Always? | Meaning |
|---|---|---|
| `placed` | yes | `false` under `--plan`. What distinguishes a plan from a placement |
| `route` | yes | `"local"` or `"fetch"`. What makes req-006 rule 2 observable: a run reporting `"local"` that contacted a remote is a contradiction a test can catch |
| `source` | yes | the caller's path on the local route; the pinned repository on the fetch route |
| `ref` | yes | the requested ref, `null` when none was given. Separate from `commit` because a ref moves |
| `commit` | yes | the resolved commit, always a full hash, never a ref name |
| `cache` | fetch route only | `"created"` or `"reused"` |
| `acceptedLocalModifications` | yes | always present, `false` rather than absent, so the provenance record persists a decision rather than an absence |
| `written` | yes | count of files written; `0` under `--plan` |
| `files` | yes | the full sorted declared set, so membership is assertable |

### Refusals

```json
{ "refused": "<code>", "message": "<the literal text>", "path": "<when the code names one>", "next": "<when a command applies>" }
```

`refused` codes are a stable enumeration, because for the agent consumer the refusal payload *is*
the API and a prose label is not one: `target-carries-harness`, `target-file-collision`,
`path-escapes-target`, `source-declares-no-set`, `source-not-a-harness`,
`source-identity-mismatch`, `source-exports-no-predicate`, `source-missing-declared-path`,
`source-declares-a-symlink`, `source-has-uncommitted-changes`, `source-has-unpushed-commits`,
`source-has-no-upstream`, `fetch-failed`, `fetch-remote-redirected`.

### Success, in human form

Literal, for the reason the refusal texts already give — and rule 1 requires the resolved commit on
the run's own output, which a description does not deliver:

```
Placed <n> files into <target>
  from <source> at <commit>
  cache: reused
```

```
<n> files would be placed into <target>
  from <source> at <commit>
  .claude 390, template 120, AGENTS.md 1, ...
```

The `cache:` line appears on the fetch route only. The grouping line appears under `--plan` only,
where the question is what would arrive rather than what did.

## Interface point 1: the placement plan

**Traces to**: req-005 rule 1 — "the file universe is the source's git-tracked files, intersected
with the source's own declared distribution predicate"; req-005 rule 2 — "a path the declaration
excludes does not travel, and a path positively named as an exception inside an excluded directory
does"; req-005 rule 3 — "the declared set is read from the resolved source at run time, never from
a list carried by this package"; req-005 rule 9 is gone — see that requirement's own note on why.

**Consumer need**: a caller has to be able to see what would be written before it is, and a
reviewer has to be able to tell a placement from a re-derivation of one.

**Where**: the set computation is the pure function the domain model names — `(tracked paths,
declaration) → the set` — with no filesystem or network of its own. The command layer supplies the
inputs and formats the result.

Given a resolved source, the command computes `tracked(source) ∩ declared(source)`. Neither input
is supplied by the caller and neither is stored in this package.

`--json` emits the payload specified above. **`placed` is what distinguishes a plan from a
placement** and `written` reports what actually landed — this interface point's consumer need is
that a reviewer can tell one from the other, and an earlier draft emitted the identical payload for
both. The
full list rather than a count is what makes req-005 rule 2 assertable: an excluded path's absence
and a named exception's presence are both single-membership checks against that array. It is also
the observable req-005 rule 3 needs — for a source whose declaration changed, the array differs
with this package unchanged.

Human output is specified verbatim in the output contract above, for both outcomes.

## Interface point 2: what is written, and how

**Traces to**: req-005 rule 4 — "file mode is preserved, so a placed hook is executable"; req-005
rule 7 — "every written path is confined to the target, and the mode bits that travel are bounded".

**Consumer need**: the placed copy has to be usable immediately — a hook that is not executable
fails silently at the moment it is supposed to protect something — without the placement being a
way to write outside the directory the caller named.

**Where**: confinement is the domain model's second pure function, `(target root, candidate path) →
permitted or refused`, called for every candidate before any write.

Each file in the plan is written at the same relative path under `--target`.

**Mode, stated exactly** (req-005 rule 7 says "beyond owner-execute", so the design has to resolve
what a wide source mode places as): a source file with any execute bit set is placed `0o755`; one
with none is placed `0o644`. Group and other write bits, setuid and setgid never travel, whatever
the source carries. So a source at `0o777` places at `0o755`.

Every candidate path is resolved and checked inside the target first, covering an absolute path, an
upward traversal, and a symlink whose destination leaves the target.

## Interface point 3: the refusals

**Traces to**: req-005 rule 5 — "a source carrying no distribution declaration is refused before
anything is written"; req-005 rule 6 — "placement refuses rather than overwriting a target file it
did not place"; req-005 rule 8 — "init refuses a target that already carries the harness, and names
upgrade instead of doing its job"; **req-006 rule 9** — "a resolved source that does not declare
itself to be that repository is refused, on both routes", which is the last three rows.

Catalogued here rather than with source resolution because a caller meets every refusal of one
command in one place; ownership of the identity check belongs to
`domain-models:source-resolution`.

**Consumer need**: an agent reading a refusal has to be able to act on it without inspecting the
tree itself, which means each refusal names the specific thing it found, and the command that
handles that case when one exists.

**Where**: each condition is a predicate over already-gathered state, evaluated before the first
write. The message text is rendered by a pure function beside those predicates rather than by the
command layer, so the literal strings below are asserted by a test; the command layer chooses only
where to print and which status to exit with.

| Condition | Message text |
|---|---|
| target carries the harness | `<target> already carries the harness. To update it, run: keystone upgrade --target <target>` |
| target has a file at a declared path | `<target>/<path> already exists and this placement would overwrite it. Placement will not overwrite a file it did not place.` |
| resolved source carries no declaration | `The source at <commit> declares no distribution set (version <version>), so there is nothing to place from it.` |
| a declared path escapes the target | `The declared path <path> resolves outside <target>, and placement writes only inside the target.` |
| source declares another repository | `The source declares itself to be <declared>, not <expected>. Placement reads only the pinned harness repository.` |
| source carries no manifest | `<source> carries no harness manifest, so it is not a harness source.` |
| source exports no predicate | `The source at <commit> exports no distribution predicate this installer can read, and it will not guess which of its files travel.` |
| source is missing a declared path | `The source declares <path> but does not hold it, so its working tree is not the commit it reports. Placement reads a tree that matches its own index.` — **accepted by `--accept-local-source`**, since a locally deleted tracked file is a local modification and refusing it past that flag would contradict req-006 rule 3 |
| source declares a symbolic link | `The source declares <path> as a symbolic link, which placement does not follow. Placement writes regular files inside the target only.` |

The last three were added during implementation rather than specified up front, and each is a
condition invariant 6 already implied — a precondition that is checkable before the first write and
would otherwise surface as a partial placement or an unstructured crash. A symlink is refused rather
than resolved because the write reads *through* a link, so following one would copy content from
outside the source into the project; the harness declares none today (measured: zero tracked
symlinks), so refusing costs nothing and resolving them would be a security surface added for no
present purpose.

`<source>` is the path the caller gave on the local route, and the pinned repository plus the
resolved commit on the fetch route — never a machine-local cache path, which means nothing to a
caller who supplied no path.

Literal text is given rather than described, following the convention
`skill-designs:develop-skill-lineage-plan-step` sets: two implementers reading a description write
two different messages and neither is testable against the spec.

Naming the specific path rather than the condition is the part that matters. "Target not empty" is
a sentence an agent cannot act on, and the second row exists precisely because a half-set-up
project is the case that gets clobbered.

**`--json` covers refusals too**, and this is the reason it exists: for the agent consumer the
refusal payload *is* the API, and a structured success beside an unstructured failure is the half
that gets parsed by regex. A refusal emits `{ refused: <condition>, message: <the text above>,
path: <the specific path, where the condition names one>, next: <the command to run, where one
applies> }`.

## Interface point 4: choosing a route

**Traces to**: req-006 rule 1 — "an explicitly given local path is used as the source, and the
commit it resolves to is reported on the run's own output"; req-006 rule 2 — "the local-path route
reaches no network and reads no credential"; req-006 rule 8 — "the fetched repository is a fixed
identity this package carries, with no option to redirect it".

**Consumer need**: a maintainer bootstrapping from a clone they already have needs the tool not to
go to the network; everyone else needs it to work with no options at all. And a test in a public CI
that cannot reach the pinned repository needs a route it can exercise.

**Where**: the route decision is a pure function of the options; each route is an adapter.

| Given | Route |
|---|---|
| `--source <path>` | that tree, no network contacted and no credential read |
| neither `--source` nor `--ref` | fetch the pinned repository's default branch |
| `--ref <tag\|branch\|sha>` | fetch that ref from the pinned repository |
| `--source` **and** `--ref` | usage error, exit `2` — see req-006 rule 5's own example; the text is in the usage table below |

There is no option naming the repository, on either route. `--source` names a tree; it does not
redirect the fetch.

Both routes end at the same identity check, and the run reports which route it took together with
the commit it resolved — that is what makes req-006 rule 2 observable rather than an intention, since
a run that reports the local route and contacted a remote is a contradiction a test can catch.

## Interface point 5: the ref and the commit

**Traces to**: req-006 rule 4 — "a fetch resolves a moving reference against the remote and records
the fixed commit rather than the reference"; req-006 rule 5 — "an explicit ref is honoured whether
it names a tag, a branch, or a commit"; req-006 rule 6 — "the fetch uses the canonical remote …
rather than any remote a clone in play happens to be configured with"; req-006 rule 10 — "a fetched
source is cached, and reuse of the cache is observable".

**Consumer need**: a later reader has to be able to tell what a project received, not merely what
was asked for — and a second run should not re-clone.

`--json` carries both: `ref` is what was requested (`null` when nothing was), and `commit` is what
it resolved to. They are separate fields because a ref can move, so a pair that disagrees later is
information rather than a defect.

**The remote is the canonical HTTPS URL for the pinned repository, always** — never a remote read
from a clone that happens to be around. A maintainer's clone can be configured with an SSH host
alias that exists on one machine, so a run that borrowed it would work there and nowhere else.

**Passing that URL is not the same as using it, and the difference is a refusal rather than a
guard.** A `url.<base>.insteadOf` rewrite cannot be cleared for a single command, so the effective
URL is resolved and checked to still designate the pinned repository — in the directory the fetch
itself will run in, because a rewrite in that directory's own config is one git honours. Another
transport reaching the same repository is fine; a different repository refuses with
`fetch-remote-redirected`, whose message carries the effective URL **redacted**, since a rewrite is
one of the places a credential appears.

**A moving ref resolves against the remote, not against the cache.** A stale cache would otherwise
place yesterday's tree while reporting today's branch name.

Cache reuse is reported — the `cache` field, and the `cache:` line in human output, both specified
above — because "this run fetched" and "this run reused what was here" are different facts about a
placed tree's origin.

## Interface point 6: refusing a local source that is not reproducible

**Traces to**: req-006 rule 3 — "a local source with uncommitted or unpushed work is refused unless
the caller accepts it explicitly, and accepting it is recorded".

**Consumer need**: a placement has to be describable afterwards. Someone reading the provenance of a
project needs the recorded commit to be one they can actually fetch.

**Where**: `(dirty, unpushed, accepted) → refusal or null` is pure and needs no repository.

| Condition | Message text |
|---|---|
| local source has uncommitted changes | `<path> has uncommitted changes, so the commit it reports is not the tree that would be placed. Re-run with --accept-local-source to place it anyway.` |
| local source has unpushed commits | `<path> is <n> commit(s) ahead of its remote-tracking ref, so the provenance recorded for this project would name a commit nobody else can fetch. That is judged from what is on disk and may be out of date. Re-run with --accept-local-source to place it anyway.` |
| local source has no upstream configured | `<path> has no upstream branch, so whether its commit is reachable by anyone else cannot be determined without contacting a remote, which this route does not do. Re-run with --accept-local-source to place it anyway.` |

Both texts state their own **basis**, which invariant 5 of the model requires and an earlier draft
of this table omitted: the judgement is made from what is on disk, so a stale remote-tracking ref
gives a stale answer, and a message implying certainty would be the wrong kind of confident. A
detached checkout at a release tag is *not* caught by the no-upstream row — a commit contained in
any remote-tracking ref is fetchable by others, whichever way the tree arrived at it.


### Usage errors (exit 2)

| Condition | Message text |
|---|---|
| `--source` and `--ref` together | `--ref selects a commit of the pinned repository and does not apply to a local source. Pass one or the other.` |
| unknown option | `unknown option: --<name>` |
| value option with no value | `--<name> needs a value` |

Accepting it is not silent: the JSON payload carries `acceptedLocalModifications: true` and the
provenance record states it, so a copy placed from an unreproducible tree says so rather than
looking like any other copy.

## Interface point 7: a failed fetch names the access required

**Traces to**: req-006 rule 7 — "a failed fetch names the access actually required instead of
surfacing the underlying tool's error"; req-006 rule 9 — "a resolved source that does not declare
itself to be that repository is refused, on both routes".

**Consumer need**: a new person hitting this needs to know it is an access problem and which
access, rather than reading a transport error and concluding the package is broken. An agent needs
the same thing structured.

**This command reads no credential**, so there is nothing to check up front and nothing to print by
accident. Authentication is supplied per-operation by the machine's own git credential helper; the
model records why that is a deliberate divergence from the token-reading pattern used elsewhere in
this suite.

So the fetch is attempted and a failure is **diagnosed** rather than pre-empted, in this order,
stopping at the first that answers.

**One probe makes the diagnosis possible at all.** At the git layer, "no access", "no such
repository" and "no such ref" are deliberately indistinguishable — GitHub returns the same thing for
all three, so that a private repository's existence is not disclosed. Distinguishing them needs an
authenticated API call, so when `gh` is available the diagnosis asks it
(`gh api repos/<owner>/<name>` and, for a ref, `gh api repos/<owner>/<name>/commits/<ref>`); when it
is not, the diagnosis says which rows it could not rule out rather than picking one.

| Finding | Message text |
|---|---|
| `git` absent | `git is not on PATH, and the harness source is fetched with it. Install git, or pass --source <path> to place from a local clone.` |
| git has no credential helper covering github.com, and SSH keys reach it | `This machine reaches github.com over SSH, and this installer fetches over HTTPS so that it cannot be redirected by a rewritten remote. Run 'gh auth login' and 'gh auth setup-git' to add HTTPS credentials, or pass --source <path> to place from a clone you already have.` |
| git has no credential helper covering github.com, and `gh` is absent | `Reaching the harness source needs git credentials for github.com. Install the GitHub CLI (https://cli.github.com), run 'gh auth login', then 'gh auth setup-git'.` |
| `gh` authenticated but git is not wired to use it | `A GitHub account is authenticated but git is not configured to use it, so the fetch has no credentials. Run 'gh auth setup-git'.` — the case a token-only environment lands in, where `gh` works and git does not |
| `gh` present, no account authenticated | `No GitHub account is authenticated. Run 'gh auth login' as an account with access to the harness source, then 'gh auth setup-git'.` |
| authenticated, and the API says the repository is not visible | `The active GitHub account cannot see the harness source repository. Check which account is active with 'gh auth status' and switch with 'gh auth switch' — access to that repository is what this installer needs, and nothing else.` |
| authenticated, repository visible, ref unknown to it | `The harness source has no ref '<ref>'. Check the tag or branch name — this is not an access problem.` |
| credentials present but not supplied by `gh` | the failure, redacted, plus `Credentials for github.com come from a git credential helper this installer did not configure, so it cannot tell you which account is in use.` |
| anything else | the failure, **redacted**, prefixed with what was being attempted |

Three of these rows are drawn from lessons already paid for rather than invented. `gh auth status`
succeeding proves only that *some* account is logged in, not that the **active** one has what is
needed — an executor in this suite learned that, which is why the visible-repository row names
`gh auth switch` and not just `gh auth login`. The account can also drift between runs, which is why
it names how to check. And the `gh auth switch` advice is deliberately **absent** from the
helper-is-not-gh row, because there is no `gh` session governing that fetch to switch.

**Every relayed failure is redacted first**, and that is a mechanism rather than a courtesy: this
command reads no credential, but git's own diagnostics echo the one it was given, and the standard
forms — a remote carrying `https://<user>:<token>@github.com/…`, or an `http.extraheader`
`Authorization` value — are exactly what a CI runner configures. Redaction is a pure function over
the text, which is the part a test can pin. See
`requirements:never-persist-or-emit-the-source-credential`, whose diagnostic-output rule this is the
only mechanism for.

The last row exists so an unanticipated failure is not swallowed by a confident wrong diagnosis,
which req-006 rule 7's second example now sanctions explicitly.

**The identity refusals** (req-006 rule 9) apply on both routes and were specified with placement's
refusals in interface point 3, because a tree failing that check was never a resolved source and
placement cannot proceed without it.

## Interface point 8: making the target a project

**Traces to**: req-009 rules 1-3 (the three target shapes), rule 4 (an existing hook path is never
silently replaced), rule 5 (the per-clone property), rule 7 (the floor assertion is run).

**Consumer need**: a placed harness whose pre-commit hook cannot fire is the defect this package
exists to remove — and it is invisible, because the hook file is present and looks installed.

**Where**: shape detection and the wiring are adapters; which shape implies which action is a pure
function of two booleans.

| Target shape | Action |
|---|---|
| package manifest **and** workspace config | invoke `nx g @abgov/nx-agent:init`; write no wiring of our own |
| manifest, no workspace config | set `core.hooksPath`; add the re-apply step to the existing manifest |
| neither | set `core.hooksPath`; write a minimal private manifest carrying the re-apply step |

`git init` runs first where the target is not a repository, because `core.hooksPath` is repository
configuration and there is nothing to set it on otherwise. No remote is added — that is a later,
deliberate act.

**An existing `core.hooksPath` is never replaced**: it is repository-wide and single-valued, so
overwriting it disables whatever check the team already had. Refusal text:
`<target> already configures core.hooksPath as '<value>'. Placement will not replace it, because it is repository-wide and would disable whatever check is already there.`

**The floor's own gate is not run here.** The harness has a preflight skill whose job is exactly
that — checking this copy and its environment, including that the tree is a git work tree — so
invoking the gate ourselves duplicated a harness capability. The handoff names it instead.

## Interface point 9: recording what this is a copy of

**Traces to**: req-008 rules 1-3 (the record and its fields), rule 4 (where it lands), rule 5 (not
in the config the project's own setup owns), rule 7 (the manifest pin).

**Consumer need**: a copy-distributed project has no inherent record of what it is a copy of, and
the hand-written script captured the commit into a file whose own closing line told the reader to
delete it.

`.keystone/install.json`, which the harness's own ignore rules leave tracked, so it reaches the
first commit:

```json
{
  "repository": "GovAlta-EMU/keystone",
  "ref": null,
  "commit": "<40-hex>",
  "installer": "@abgov/keystone@<version>"
}
```

**Four fields, narrowed from seven.** The harness's own configuration step already stamps the
version it was built from; what it cannot derive is the ref and commit a copy was fetched at,
because a copy has no remote. A parallel record of route, acceptance and a timestamp duplicated a
harness capability, and reading the record back belongs to the harness's own health-board skill.

`repository` is the identity, never a URL — a URL is where a credential would appear, and
`requirements:never-persist-or-emit-the-source-credential` makes that a rule rather than a
preference. **Nothing is written into `.keystone/project.json`**: that file belongs to the
project's own configuration step, which refuses to run if it already exists.

Where a manifest exists the installer also pins itself there as a development dependency, so the
lockfile carries the version too.

## Interface point 10: stopping at a handoff, or starting the next session

**`--setup` (opt-in) starts the configuration step instead of printing the handoff.** The handoff
exists because a bootstrap session cannot run harness skills — they resolve against the new
project's configuration and hooks, which bind only to a session started there. An earlier draft
called that a correctness property of the installer; it is not. The constraint is that a session
cannot **re-root itself**, and a CLI spawning a fresh process with `cwd` set to the target is not
subject to it.

It is opt-in rather than the default for three reasons, each of which would make a default wrong:
the configuration step is **interactive by design** (it asks for profile, mode and variant, and the
harness's own script refuses rather than guessing a layout, so a non-interactive run would make an
agent invent answers that gates then enforce); a CLI that blocks on an interactive session is wrong
in CI and wrong when an agent runs it, so it refuses on a non-TTY and prints the handoff instead;
and it makes the agent CLI an external dependency, which is reasonable for a harness of that kind
but should be a choice. It launches the step **already verified against the source's declaration**,
so it cannot start a command the harness does not have.

## Interface point 10a: the handoff itself

**Traces to**: req-010 rule 1 (no harness command is run), rule 2 (names the step and the
directory), rule 3 (a bare declared identifier), rule 4 (a source declaring none says so), rule 5
(re-running reprints and writes nothing).

**Consumer need**: the next step runs in a different session, and the reader may be an agent that
will not question a printed instruction.

The configuration step's name is **verified against the source's own declared skills** rather than
carried here. That is the whole guard: the hand-written installer named a command that had not
existed for three months. A name the source does not declare is not printed — the handoff says so
instead. A declared name that is not a bare identifier (letters, digits, hyphen, underscore) is
refused rather than printed, because the handoff is read and run and the source is fetched content.

```
Placed the harness into <target>.

1. Commit this placement. Every placed file is untracked until you do, and an upgrade
   needs a clean tree to be reversible — so `keystone upgrade` will refuse until then.
2. Open a new session rooted in <target>, then run /<step>.
   It must be a new session rooted there — the harness's own commands resolve against
   this project's configuration and hooks, which bind only to a session started in it.
```

**The commit step is a composition fix, not housekeeping.** Placement leaves every placed file
untracked, and the harness's own upgrade tool refuses a tree with uncommitted changes, because an
upgrade overwrites files and a clean tree is what makes it reversible. So `init` left a project in
which `upgrade` — the command `init`'s own refusal names — could not run. Committing on the
caller's behalf was declined: a commit needs an author identity that may not be configured, and it
is the caller's act. Telling them, with the reason, is the smaller and more honest fix.

Nothing from the placed tree is executed, with one stated exception: the floor assertion in
interface point 8, which is the target's own instrument and is why it is run rather than
reimplemented.

**Re-running `init` on a placed target reprints this handoff** and writes nothing, which is what
makes a closed session recoverable. It still exits `1` with the upgrade guidance of interface
point 3, because the target does already carry the harness — the handoff is additional, not
instead.

## Interface point 11: `keystone upgrade`

**Traces to**: req-007 rule 1 (spawn the source's own tool), rule 2 (this package writes nothing
else), rule 3 (a refusal leaves the target unchanged and fails the command), rule 4 (refuse a
target with no harness, naming init), rule 5 (rewrite the provenance record on success), rule 6
(the plan-versus-apply default is the delegated tool's).

**Consumer need**: `init`'s own refusal already tells a caller to run this. Until it exists, the
installer names a command it does not have — which is the defect class the handoff guard exists to
prevent, in this package's own output.

```
keystone upgrade [--target <dir>] [--ref <tag|branch|sha>] [--source <path>]
                 [--accept-local-source] [--apply] [--json]
```

Source resolution is **the same** as `init`'s (interface points 4–7), unchanged: the same routes,
the same refusals, the same diagnosis.

**Where**: there is no core logic here beyond the target predicate. The merge rules belong to the
harness and are read from it; this package contributes a spawn and a faithful exit status.

| Behaviour | Contract |
|---|---|
| what performs the work | the resolved source's own upgrade tool, **spawned as a process**, with the target as its argument |
| default | plan, writing nothing — the delegated tool's own default, read from it rather than restated. `--apply` performs it |
| a refusal by the tool | exits `1`, and the target is unchanged. Its output is relayed **redacted**, since relaying is how a credential reaches a log |
| target has no harness | exits `1` before the tool is spawned: `<target> does not carry the harness, so there is nothing to upgrade. To place it, run: keystone init --target <target>` |
| provenance | **rewritten on success only.** A refused or planned run leaves it alone |

The provenance rewrite is the one thing this package writes during an upgrade, and it is a
deliberate carve-out from rule 2: the record is this package's own artifact, not harness content.
Without it a project's recorded provenance names the commit it was born from forever, and the
versioned-artifact claim fails on every upgrade after the first.

## What publishes

**Traces to**: req-011 rules 1-3 (the packed contents are compared against an expected-file
manifest, on the publish path), rule 4 (nothing installs code alongside it), rule 5 (public
access).

Not a command — a property of the artifact. The control is `packages/keystone/expected-files.json`,
this repository's own statement of what it ships, compared against a real `npm pack` by
`verify-package.mjs`, which the `release` target runs **before** semantic-release.

**Compared against that file rather than against `package.json`'s `files`.** Comparing packed
output to the allowlist proves only that npm applied the allowlist: one that itself admitted harness
content, a credential file or local configuration would pass. The realistic failure is a directory
or glob entry quietly widening as files are added under it, which is invisible to any check treating
the list as its own oracle. Measured: widening the list to `src/**/*` and adding a file under
`src/testing/` is caught, naming each unexpected path.

`--update` re-states the expectation deliberately, so widening what ships is a decision on the
record rather than a side effect.

req-012's rules are carried by the same artifact rather than by a command: no credential is read
(the diagnosis asks `gh auth status`, never `gh auth token`), none is written to the cache, and
anything relayed from a spawned tool or from git is redacted first — the one rule that needed a
mechanism rather than a construction.

## Deferred

Nothing of `init` or `upgrade` remains.
