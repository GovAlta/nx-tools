# @abgov/nx-agent

Nx plugin for AI-agent development tooling — capabilities that steer a coding agent's day-to-day
work, as opposed to `@abgov/nx-adsp`/`@abgov/nx-oc`'s scaffolding and deployment concerns.

## TLDR

```bash
# 1. Install
npm i -D @abgov/nx-agent

# 2. Set up recommended AI-agent tooling for this workspace
npx nx g @abgov/nx-agent:init
```

## `init`

A single, prescriptive entry point — run once per workspace. It's expected to grow as more
capabilities are added; running it again after an upgrade re-applies whatever's new without
disturbing anything it already set up.

Currently sets up:

1. **A Husky pre-commit hook** (`.husky/pre-commit`) that runs `nx affected` lint/test/build
   against your _staged_ changes before every commit:

   ```sh
   git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t lint,test,build --stdin
   ```

   Adds `husky` as a devDependency and a `"prepare": "husky"` script if not already present.

2. **A secret-scanning hook block**, appended to the same `.husky/pre-commit`, scanning staged
   files for committed credentials with [secretlint](https://github.com/secretlint/secretlint):

   ```sh
   secretlint_files=$(git diff --cached --name-only --diff-filter=ACMR)
   if [ -n "$secretlint_files" ]; then
     echo "$secretlint_files" | xargs npx secretlint || exit 1
   fi
   ```

   Adds `secretlint` and `@secretlint/secretlint-rule-preset-recommend` as devDependencies, and a
   `.secretlintrc.json` if one doesn't already exist (never overwritten once created — rules are
   the kind of thing a team tunes, unlike the AGENTS.md guidance below).

3. **Baseline `.gitignore` entries** for common local-credential filenames — `.env.local`,
   `.env.*.local`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `credentials.json` — added only if
   missing, appended alongside whatever's already there. Deliberately excludes bare `.env`: it's
   dual-purpose (plain workspace config as well as secrets), so a blanket rule would be a false
   positive on legitimate use. This is preventive rather than detective — once a pattern is in
   `.gitignore`, git itself refuses to stage a matching file via `git add .`/`git add -A`, so no
   separate pre-commit check is needed on top of it. It does nothing for a file that was already
   tracked before `init` ran; gitignore never retroactively untracks anything.

4. **One consolidated `AGENTS.md` section**, `## Working with a coding agent`, organized into six
   `###` groups — ordered roughly by stakes, highest first — each holding several related `**`
   items rather than one flat, ever-growing list of top-level headings:
   - **Security and safety** — secrets, PII/sensitive data, destructive operations, untrusted
     content and instructions, trust boundaries.
   - **Dependency hygiene** — choosing a dependency (existence/currency/license, and checking
     whether an existing dependency already covers the need before adding another one).
   - **Verifying your work** — the pre-commit-check habit above, plus respecting whatever
     style/format/complexity tooling a project already has configured.
   - **Version control practices** — atomic Conventional Commits, GitHub Flow, linear history.
   - **Conventions and consistency** — ubiquitous language (domain vocabulary), matching this
     project's own established patterns, following framework/library idioms, and checking a
     connected MCP server before recalling a platform/design-system API from memory.
   - **Code quality** — scope discipline, comments (why, not what), reuse before reinventing,
     error handling, TODO transparency, test quality.

   The whole section is centrally maintained: re-running `init` refreshes it in place rather than
   leaving it frozen at first-generation wording, assembled from `guidance/<group>/<item>.md`
   files (one file per item, grouped into folders matching the six groups above) so the content
   previews as plain markdown rather than escaped TypeScript string literals. `init` is also
   self-migrating — if it finds section markers from an older, pre-consolidation version, it
   removes them and writes the current structure in their place, so simply re-running `init` is
   enough to pick up changes; no separate migration step.

   Also ensures `CLAUDE.md` imports it (`@AGENTS.md`, appended if missing) — Claude Code reads
   `CLAUDE.md` natively, not `AGENTS.md` directly, so without this the guidance above never
   reaches a Claude Code session. Same one-line convention nx-adsp's own generators already use.

5. **A Claude Code deny-list** (`.claude/settings.json`), hard-blocking shell patterns with no
   legitimate agent-initiated use case — `rm -rf` rooted at `/`/`~`/`$HOME`, `sudo`, `mkfs`,
   `chmod -R 777 /`, system shutdown/reboot, history-rewriting/reflog-destroying git commands,
   and whole-namespace OpenShift/Kubernetes deletion — absolute per Claude Code's own permission
   model, holding even under `--dangerously-skip-permissions`. Merges into an existing file
   rather than overwriting it. No equivalent exists yet for other tools (checked GitHub Copilot
   CLI specifically — its absolute deny mechanism is CLI-flag-only, with no repo-committed file
   to seed).

### Options

| Option    | Default           | Description                                                                                                                               |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `targets` | `lint,test,build` | Targets run by both the pre-commit hook and the AGENTS.md guidance's self-check command                                                   |
| `base`    | `main`            | Base branch used only in the AGENTS.md guidance's self-check command (not the pre-commit hook, which always diffs against staged changes) |

```bash
npx nx g @abgov/nx-agent:init --targets=lint,test --base=develop
```

## `feature`

How new work enters the DDDD workflow — a raw capability request, written the way it was actually
asked for. This is the root artifact Discover decomposes into a `service-description`/`requirement`;
it replaces committing an ad hoc file by hand with no defined shape:

```bash
npx nx g @abgov/nx-agent:feature "Submit Minor Collision Report"
```

Creates `project-docs/features/submit-minor-collision-report.md`:

```markdown
---
title: Submit Minor Collision Report
project-docs-ancestors: []
resolves: []
---

<!-- What capability is wanted, and why. This is the raw request Discover decomposes into a
     service-description/requirement -- write it the way it was actually asked for. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                                                                                                           |
| ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                | — (required, positional) | The canonical name of the feature                                                                                                                                                                                     |
| `project`              | workspace root           | Scope the feature to a specific project's `project-docs/features/` instead — prefer this whenever it already has a natural code home                                                                                  |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this feature relates to — repeatable; typically an existing service-description if this extends an initiative that already exists                                         |
| `resolves`             | none                     | Paths to existing `open-question`/`blocker` artifacts this feature resolves — repeatable; also added to `project-docs-ancestors`, but recorded distinctly so `project-docs-lineage` can report the resolution as such |

Re-adding a feature that already exists throws rather than silently overwriting or duplicating it. A
`--project-docs-ancestors` path that doesn't resolve to an existing artifact throws the same way,
before anything is written.

## `bug`

Something already built not behaving as designed, reported from outside the workflow. Unlike
`blocker`, a bug doesn't assume the design is wrong — most bugs are pure implementation defects — and
it doesn't always know which artifact (if any) is at fault yet, so `projectDocsAncestors` is
genuinely optional:

```bash
npx nx g @abgov/nx-agent:bug "Submit Button Does Nothing On Slow Connections"
```

Creates `project-docs/bugs/submit-button-does-nothing-on-slow-connections.md`:

```markdown
---
project-docs-ancestors: []
resolves: []
---

<!-- Observed vs. expected behavior. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                  |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `description`          | — (required, positional) | A short slug for what's wrong                                                                                                |
| `project`              | workspace root           | Scope the bug to a specific project's `project-docs/bugs/` instead — prefer this whenever it already has a natural code home |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this bug relates to, if already known — often genuinely empty until triaged      |

A bug tracks open/resolved status the same generic way as `open-question`/`blocker`
(`resolutionStatus.open`/`.resolved`), but resolves differently — see `develop/SKILL.md`'s bug-fixing
section in the `agent-delivery` output below. Investigating a bug and finding the _spec_ itself was
wrong escalates to a real `blocker` against the implicated artifact; filing that blocker does not
itself resolve the bug — only an `iteration-retrospective --resolves` naming the bug's own path does.

## `domain-term`

Adds one domain term — the ubiquitous language `init`'s guidance asks the agent to use, but gives
it nowhere to check or record. Unlike `init`, this is repeatable — run it once per term, whenever
one needs adding, not once per workspace:

```bash
npx nx g @abgov/nx-agent:domain-term Case
```

Creates `project-docs/domain-terms/case.md`:

```markdown
---
term: Case
aliases: []
not_confused_with: []
project-docs-ancestors: []
resolves: []
---

<!-- Definition: describe this term in the domain's own language. -->
```

- `term` — the canonical name, matching the filename.
- `aliases` — other words that mean the same thing.
- `not_confused_with` — similar-sounding terms this one is deliberately distinct from, and why.
- `project-docs-ancestors` — other `project-docs/` artifacts this term derives from (see
  `project-docs-lineage` below) — set via `--project-docs-ancestors`, never by hand.
- `resolves` — which of those ancestors (typically an `open-question`/`blocker`) this term
  specifically _resolves_, not just builds on — set via `--resolves`, a distinct flag from
  `--project-docs-ancestors` even though the same ref also lands there.

One file per term rather than a single flat glossary, so frontmatter (a per-file construct in
every tool that uses the term) is meaningful, and so listing the folder — cheap, just filenames —
is enough to check the existing vocabulary before coining a new name.

Also bootstraps `project-docs/domain-terms/README.md` on first use, explaining the convention to
whoever (human or agent) opens the folder next. That file has no value on its own — it exists only
to explain the convention for the term about to be added — so there's no separate "set up the
glossary" generator; `domain-term` composes it as an internal step.

### Options

| Option                 | Default                  | Description                                                                                                                                                                                                        |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `term`                 | — (required, positional) | The canonical domain term, as domain experts use it                                                                                                                                                                |
| `project`              | workspace root           | Scope the term to a specific project's `project-docs/domain-terms/` instead — prefer this whenever the term already has a natural code home (usually a domain library), not just workspace root by default         |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this term derives from — repeatable; resolved into `project-docs-ancestors` (see below)                                                                                |
| `resolves`             | none                     | Paths to existing `open-question`/`blocker` artifacts this term resolves — repeatable; also added to `project-docs-ancestors`, but recorded distinctly so `project-docs-lineage` can report the resolution as such |

```bash
npx nx g @abgov/nx-agent:domain-term Case --project=domain-lib
npx nx g @abgov/nx-agent:domain-term "Collision Report" --project-docs-ancestors=project-docs/bounded-contexts/collision-reporting.md
```

Re-adding a term that already exists throws rather than silently overwriting or duplicating it —
edit the file directly instead. A `--project-docs-ancestors` path that doesn't resolve to an existing
artifact throws the same way, before anything is written.

## `bounded-context`

A domain term's meaning only holds within a bounded context — the boundary past which the same word
can mean something else entirely. Adds one:

```bash
npx nx g @abgov/nx-agent:bounded-context "Collision Reporting"
```

Creates `project-docs/bounded-contexts/collision-reporting.md`:

```markdown
---
name: Collision Reporting
aliases: []
not_confused_with: []
project-docs-ancestors: []
resolves: []
---

<!-- Definition: describe what's inside this boundary, and what's explicitly outside it. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                                                                                                           |
| ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | — (required, positional) | The canonical name of the bounded context                                                                                                                                                                             |
| `project`              | workspace root           | Scope the context to a specific project's `project-docs/bounded-contexts/` instead — prefer this whenever the context already has a natural code home (usually a domain library), not just workspace root by default  |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this context derives from — repeatable; resolved into `project-docs-ancestors`                                                                                            |
| `resolves`             | none                     | Paths to existing `open-question`/`blocker` artifacts this context resolves — repeatable; also added to `project-docs-ancestors`, but recorded distinctly so `project-docs-lineage` can report the resolution as such |

```bash
npx nx g @abgov/nx-agent:bounded-context "Collision Reporting" --project=domain-lib
```

Re-adding a context that already exists throws rather than silently overwriting or duplicating it.

## `domain-model`

The actual design — aggregates, entities, invariants — built from a bounded context and the domain
terms it's composed from:

```bash
npx nx g @abgov/nx-agent:domain-model "Collision Report Lifecycle" \
  --project-docs-ancestors=project-docs/bounded-contexts/collision-reporting.md \
  --project-docs-ancestors=project-docs/domain-terms/collision-report.md
```

Creates `project-docs/domain-models/collision-report-lifecycle.md`:

```markdown
---
name: Collision Report Lifecycle
project-docs-ancestors: [bounded-contexts:collision-reporting, domain-terms:collision-report]
resolves: []
---

<!-- Design: describe the aggregates, entities, value objects, and invariants here. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                                                                                                         |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | — (required, positional) | The canonical name of the domain model                                                                                                                                                                              |
| `project`              | workspace root           | Scope the model to a specific project's `project-docs/domain-models/` instead — prefer this whenever the model already has a natural code home (usually a domain library), not just workspace root by default       |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this model derives from — repeatable; normally the bounded context it belongs to plus the domain terms it's composed from                                               |
| `resolves`             | none                     | Paths to existing `open-question`/`blocker` artifacts this model resolves — repeatable; also added to `project-docs-ancestors`, but recorded distinctly so `project-docs-lineage` can report the resolution as such |

Re-adding a model that already exists throws rather than silently overwriting or duplicating it. A
`--project-docs-ancestors` path that doesn't resolve to an existing artifact throws the same way,
before anything is written.

## `open-question`

Something undecided that can't be guessed at — needs input, a decision, or more information before
work depending on it can proceed:

```bash
npx nx g @abgov/nx-agent:open-question "Reviewer Authorization" \
  --project-docs-ancestors=project-docs/requirements/reviewer-role.md
```

Creates `project-docs/open-questions/reviewer-authorization.md`:

```markdown
---
project-docs-ancestors: [requirements:reviewer-role]
resolves: []
---

<!-- What's undecided, and why it can't be guessed at. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                                 |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `question`             | — (required, positional) | A short slug for what's undecided                                                                                                           |
| `project`              | workspace root           | Scope the question to a specific project's `project-docs/open-questions/` instead — prefer this whenever it already has a natural code home |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this question grounds on — repeatable; an open question can ground on any artifact kind         |

A question is never marked resolved by editing its own file — some other artifact resolves it via
its own `--resolves` flag (see `domain-term`/`bounded-context`/`domain-model` above). Re-adding a
question that already exists throws rather than silently overwriting or duplicating it.

## `blocker`

An existing artifact that needs revision — something already established but wrong, incomplete, or
in conflict with something discovered later:

```bash
npx nx g @abgov/nx-agent:blocker "Cant Ship Payment Flow" \
  --project-docs-ancestors=project-docs/domain-models/collision-report-lifecycle.md
```

Creates `project-docs/blockers/cant-ship-payment-flow.md`:

```markdown
---
project-docs-ancestors: [domain-models:collision-report-lifecycle]
resolves: []
---

<!-- What needs fixing, and why it is blocking. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                          |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `description`          | — (required, positional) | A short slug for what needs fixing                                                                                                   |
| `project`              | workspace root           | Scope the blocker to a specific project's `project-docs/blockers/` instead — prefer this whenever it already has a natural code home |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this blocker relates to — repeatable; typically the artifact that needs revision         |

Same resolution model as `open-question`: never mark it resolved by editing its own file — the
artifact that actually revises the thing it's blocking resolves it via `--resolves`.

## `iteration-retrospective`

A close-out record for a single iteration's pass — what it did, what was found and fixed along the
way, and an explicit status when "deployment succeeded" and "verified working end-to-end" diverge:

```bash
npx nx g @abgov/nx-agent:iteration-retrospective "Submit Minor Collision Report" \
  --project-docs-ancestors=project-docs/requirements/submit-minor-collision-report.md \
  --resolves=project-docs/blockers/no-write-packages-credential-for-ghcr-sandbox-push.md
```

Creates `project-docs/iteration-retrospectives/submit-minor-collision-report.md`:

```markdown
---
title: Submit Minor Collision Report
project-docs-ancestors: [requirements:submit-minor-collision-report, blockers:no-write-packages-credential-for-ghcr-sandbox-push]
resolves: [blockers:no-write-packages-credential-for-ghcr-sandbox-push]
---

<!-- Free-text body: what this pass did, what was found and fixed along the way, and an
     explicit status when "deployment succeeded" and "verified working end-to-end" diverge. -->
```

### Options

| Option                 | Default                  | Description                                                                                                                                                                                                                        |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                | — (required, positional) | A short title for this iteration's pass                                                                                                                                                                                            |
| `project`              | workspace root           | Scope the retrospective to a specific project's `project-docs/iteration-retrospectives/` instead — prefer this whenever the iteration already has a natural code home                                                              |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this pass covered — repeatable; every requirement, domain model, or design substantively created, revised, or touched this iteration, not just the requirement it nominally closes out |
| `resolves`             | none                     | Paths to existing `open-question`/`blocker` artifacts this iteration resolved — repeatable; also added to `project-docs-ancestors`, but recorded distinctly so `project-docs-lineage` can report the resolution as such            |

Self-registers its own `project-docs/artifact-schema.json` entry as `terminal: true` (see
`project-docs-lineage` below) — a correctly-closed-out retrospective has zero descendants by design,
so it's excluded from the `unreferenced` report rather than flagged alongside a genuine dead-end. Re-adding a
retrospective that already exists throws rather than silently overwriting or duplicating it.

## `pin-ancestors`

```bash
npx nx g @abgov/nx-agent:pin-ancestors                              # whole workspace
npx nx g @abgov/nx-agent:pin-ancestors --ancestor=domain-terms:case  # just this ancestor's descendants
npx nx g @abgov/nx-agent:pin-ancestors --artifact=domain-models:x    # just this artifact's references
```

Records each resolved ancestor's current body digest on the `project-docs-ancestors` reference that
names it, so `project-docs-lineage` can later report `status.stale`. Handles both YAML sequence
styles the generators emit (block lists and flow lists) and **warns rather than skipping** on a
form it can't rewrite — a silently unpinned reference is indistinguishable from a deliberately
unpinned one, and would report nothing forever. A reference that doesn't resolve is left alone;
that's a broken reference, and `project-docs-lineage` reports it as one.

**Run it by hand. Never from a hook, a CI step, or a clean-run path.** A pin asserts _"I have read
this ancestor as it stands"_ — a claim only a person can make. A blind bulk re-pin bakes in whatever
drift already exists and then reports it as the floor. It's a separate generator rather than a
`--repin` flag on `project-docs-lineage` for the same reason: that command reads and reports, and a
mutation living next to `--strict` is how the check ends up silently dead in a workflow.

Prefer `--ancestor`. "I revised one term, re-pin its descendants" is an act you can justify in a
commit message; re-pinning the workspace is only ever "make the report stop." Because digests live
in the committed artifact, either way the re-pin shows up in your own diff — which is what makes it
reviewable, unlike a central baseline that re-seals where nobody looks.

`resolves` lists are untouched: resolving an open question isn't a derivation, so the question's
content moving doesn't invalidate the resolver.

## `project-docs-lineage`

Scans the whole workspace for `project-docs/` artifacts and `project-docs-ancestors` references —
across both doc frontmatter and code comments — and writes the resulting graph to
`.nx-agent/lineage.json` (gitignored automatically; it's fully derived from other files, so
committing it would just create a second, driftable source of truth). Every violation it finds is
**recorded in the output rather than aborting the write** — the consumer that acts on one is a
script reading that file (`agent-delivery`'s task-identification), not a human reading this
console, so aborting would take every unrelated fact in the graph down over one dangling reference
and disable the very mechanism that reports it.

Findings are split on a property intrinsic to the graph rather than on severity: **is the defect
_in_ the graph, or is it a fact the graph is correctly reporting?**

`integrity` means the graph can't be trusted as a graph. `--strict` fails on any of it, and that
isn't configurable — a consumer asking "was this graph even constructible" isn't expressing a
preference.

| `integrity`       | What it is                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| `brokenRefs`      | a declared edge whose endpoint doesn't exist                           |
| `unparseableRefs` | a token that doesn't fit the `<type>[:<id>]` grammar at all            |
| `yamlErrors`      | a node whose frontmatter couldn't be read, so its edges are unknown    |
| `cycles`          | artifacts deriving from each other, so the ancestry is not a hierarchy |
| `schemaErrors`    | an `expectedAncestorTypes` value misspelled from a real type           |

`status` means the graph is sound and is telling you where the work stands. None of it fails
`--strict`; gating on any of it is a project policy and belongs to you.

| `status`       | What it is                                                            |
| -------------- | --------------------------------------------------------------------- |
| `resolution`   | `{ open, resolved }` — which `tracksResolution` artifacts are settled |
| `unreferenced` | nothing derives from it yet (no inbound edges)                        |
| `unscoped`     | every edge resolves, but an expected ancestor type is missing         |
| `stale`        | a pinned ancestor was revised after this artifact derived from it     |

`cycles` matters because `project-docs-ancestors` is a _derivation_ relation — two artifacts each
declaring the other is contradictory, since neither can precede the other. Traversal always
terminated safely on one; what it never did was say so, so `getAncestors(…, Infinity)` returned a
correct-looking finite set that quietly omitted the fact that the ancestry wasn't a hierarchy.

`schemaErrors` is deliberately narrow. A type is a literal `project-docs/` subfolder name with no
authoritative list of valid ones, so an _unknown_ type is ambiguous — `requirements` expecting
`product-briefs` before the first product brief exists looks identical to a misspelling, and
flagging it would fail `--strict` on a correct schema. What is decidable is a value differing from a
real type only by pluralization or case, which is the slip that actually happens (every type name is
plural, so `bounded-context` is one keystroke from `bounded-contexts`). Those are reported with the
type they meant, and are the only ones dropped from the `unscoped` check — one bad value would
otherwise report every artifact of its type as unscoped, forever, pointing at artifacts that are
correct.

`stale` is the ancestor-digest mechanism. A reference may optionally record the ancestor's body
digest at the time it was written — `domain-terms:case@a3f9c2e1b004` — and three states follow:

| digest           | meaning                                             | report     |
| ---------------- | --------------------------------------------------- | ---------- |
| absent           | hand-authored, or predates adoption                 | **silent** |
| present, matches | current                                             | silent     |
| present, differs | the ancestor was revised after this derived from it | reported   |

The silent first state is what makes it adoptable: turning this on reports nothing until something
is deliberately pinned. Pin with `nx g @abgov/nx-agent:pin-ancestors`.

**The digest covers the body only**, not frontmatter, and that isn't a shortcut. Recording a pin
edits `project-docs-ancestors`, so a whole-file hash would make re-pinning a content change — one
edit to a root would cascade staleness through the entire transitive descendancy in waves, each
wave's fix triggering the next. A body digest stops at depth 1, and propagates one hop further
exactly when a re-pin came _with_ a real revision, which is when descendants should look. It also
keeps the hash independent of where a digest is stored, and avoids canonicalising a parsed YAML
object to keep it stable.

The cost is permanent rather than a wart to fix later: **a type that keeps its meaning in
frontmatter is not covered at all.** `requirements` is that type — its `rules` _are_ the artifact —
and they live there deliberately so a real YAML parser can read them (`check-example-mapping.mjs`
had two regex-parsing bugs before the move). For those, a material change is a different artifact,
not an edit.

The body is normalised for line endings, trailing whitespace, and the blank line Prettier inserts
after the frontmatter delimiter — that last one matters, since `formatFiles()` runs at the end of
every generator and would otherwise invalidate a pin immediately after writing it.

`status` is computed from **structure only** — edges and schema expectations. Status an artifact
declares about itself in frontmatter (a `questions` list, a `status:` field) deliberately stays in
`metadata`, passed through verbatim for you to interpret. The moment this computed a finding from
one of those, it would have taken a position on your workflow, and being workflow-agnostic is what
makes it consumable from outside.

```bash
npx nx g @abgov/nx-agent:project-docs-lineage
npx nx g @abgov/nx-agent:project-docs-lineage --dry-run   # compute and report, write nothing
npx nx g @abgov/nx-agent:project-docs-lineage --strict     # non-zero exit on a violation, for a gate
npx nx g @abgov/nx-agent:project-docs-lineage --json --quiet   # print the graph to stdout
```

`--strict` on its own is a gate, not a way to build the graph: Nx rolls a generator's staged write
back when it throws, so a failing `--strict` run deliberately produces no `lineage.json` at all.

`--json` prints the same object to stdout instead of the human-readable summary — and because
stdout isn't subject to that rollback, **`--json --strict` is the one invocation that yields both
the graph and a failing exit code in a single run**. Pair it with `--quiet`, or Nx's own
`NX Generating ...` banner lands on stdout ahead of the document.

### The consumed shape

`schemaVersion` versions the paths below, and only those. Everything else in the file is
implementation detail and may change without a bump.

| Path                          | Shape                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `schemaVersion`               | number — `1` today                                                                             |
| `registry[<ref>]`             | `{ path, bodyDigest, ancestorRefs[], resolves[], metadata }`                                   |
| `index[<ref>][]`              | `{ file, type?, metadata? }` — `type` only when the descendant is itself a registered artifact |
| `integrity.brokenRefs[]`      | `{ ref, referencedFrom }`                                                                      |
| `integrity.unparseableRefs[]` | `{ ref, foundIn }`                                                                             |
| `integrity.yamlErrors[]`      | `{ path, error }`                                                                              |
| `integrity.cycles[]`          | arrays of ref strings — one cycle each, first node not repeated                                |
| `integrity.schemaErrors[]`    | `{ type, expectedAncestorType, didYouMean }`                                                   |
| `status.resolution`           | `{ open[], resolved[] }`                                                                       |
| `status.unreferenced[]`       | ref strings                                                                                    |
| `status.unscoped[]`           | ref strings                                                                                    |
| `status.stale[]`              | `{ artifact, ancestor, pinnedDigest, currentDigest }`                                          |
| `violations`                  | **deprecated** — see below                                                                     |

This records what is already load-bearing rather than adding a new promise. `agent-delivery`'s
`task-identification.mjs` reads every one of those `violations` keys plus `registry[].ancestorRefs`,
`registry[].path` and `index[].type`; the `design` and `develop` skills read `index` entries, and
`discover` reads `violations.resolutionStatus`. All of them are generated **write-if-missing**, so a
workspace keeps its own copy and re-running the generator cannot repair a shape change — only a
migration can. So pin `schemaVersion` and fail on an unexpected value rather than reading around a
field that may have been renamed — `task-identification.mjs` does exactly that, and names both
versions when they disagree.

`violations` is a **deprecated** flat view of both containers, kept because those generated files
can't be repaired by re-running the generator. It's assembled from the very same arrays as
`integrity` and `status`, so it can't drift from them, and it will be removed at `schemaVersion` 2.
Read the two containers instead.

The `project-docs-ancestors` convention itself: a directive used identically in frontmatter (a YAML
list) and code comments (comma-separated on one line), shaped `<type>[:<id>][#fragment]`. `type` is
the literal `project-docs/` subfolder name — no singular/plural guessing, so a new artifact kind
works immediately with no schema to update. `id` is the filename minus extension, present only for
a collection artifact (many instances, one file each, inside a type-named folder); a singular
artifact (exactly one file directly under `project-docs/`, no subfolder) is referenced by its bare
type, no id — e.g. `domain-terms:case` for a term, `architecture-overview` alone for a one-off doc.
An optional project qualifier (`<project>/type:id`) scopes the reference to that project's own
`project-docs/` instead of the workspace root's — never implicit, even from within that same
project, so a reference's meaning never depends on where it's found.

Not yet wired into the pre-commit hook or an Nx inferred plugin — run it yourself after adding or
changing a reference, and `--strict` it in your own CI if you want a broken reference to fail the
build (`--dry-run` alone reports without affecting the exit code).

Also reports which `open-question`/`blocker` artifacts are still open versus resolved — see
`resolutionStatus` below.

### `project-docs/artifact-schema.json`

An artifact-producing generator (`domain-term`, `bounded-context`, `domain-model`, `open-question`,
`blocker`) self-registers its own entry here on first use, declaring what ancestor type its kind
normally expects — e.g. `domain-terms` expects a `bounded-contexts` ancestor — and, separately,
whether its kind has a resolution lifecycle at all:

```json
{
  "bounded-contexts": { "expectedAncestorTypes": [] },
  "domain-terms": { "expectedAncestorTypes": ["bounded-contexts"] },
  "domain-models": { "expectedAncestorTypes": ["bounded-contexts", "domain-terms"] },
  "open-questions": { "expectedAncestorTypes": [], "tracksResolution": true },
  "blockers": { "expectedAncestorTypes": [], "tracksResolution": true },
  "iteration-retrospectives": { "expectedAncestorTypes": [], "terminal": true },
  "requirements": {
    "expectedAncestorTypes": ["product-briefs"],
    "digestFields": ["rules"]
  }
}
```

`digestFields` names the frontmatter fields that carry a type's **content** rather than its
bookkeeping, so they count toward its digest alongside the body (see `stale` above). It's a
structural fact about where a type keeps its meaning, not a switch for whether the check runs.

`requirements` is the only type that needs it, and measurably so: every other artifact kind has a
639–6857 character body, while requirements have **none** — their `rules` _are_ the artifact, and
they live in frontmatter deliberately so a real YAML parser can read them. So a change to `rules`
marks descendants stale, while a `title` fix or an answered `question` does not. Absent or empty
means body-only, which is right for every type that explains itself in prose, and a type with no
`digestFields` keeps exactly the digest it had before this existed.

One consequence worth knowing: because declared fields are hashed _alongside_ the body rather than
instead of it, editing a requirement's rationale prose also marks its descendants stale. That
over-fires slightly — rationale is explanatory, not contractual — but rationale is written once at
creation, a requirement has few descendants, and the alternative (declared fields _replacing_ the
body) would silently drop body coverage for any type that has meaningful content in both.

`project-docs-lineage` reads this generically — it has no knowledge of any specific type baked in, so
a hand-added entry for a custom artifact kind gets the same checks for free. `expectedAncestorTypes` is
an all-of list, not any-of: `domain-models` above requires an ancestor of _both_ `bounded-contexts`
and `domain-terms`, not either — a model with only one is still missing part of the vocabulary it
should be built from. An artifact whose type has an entry here but is missing an ancestor of one of
the expected types is reported (not thrown, since this is a convention nudge rather than a hard rule)
as `unscoped` in `.nx-agent/lineage.json`'s `violations`.

`tracksResolution: true` is what makes `open-questions`/`blockers` show up in `resolutionStatus`
(below) — a custom artifact kind with the same lifecycle (something that starts undecided/blocking
and gets settled by another artifact) gets the same open/resolved report for free by declaring it.

`terminal: true` marks a type where zero descendants is what correct looks like, not a sign of
neglect — a close-out/retrospective artifact, working exactly as intended, still has nothing ever
built on top of it. See `unreferenced` below.

### `unreferenced`

`status.unreferenced` lists every registered artifact nothing in the workspace references — the
"nothing derives from it yet" case, distinct from `unscoped` (missing an _expected_ ancestor,
the opposite direction).

Named for the mechanism rather than called `orphans`, which inverted the metaphor: references are
backward-only, so this is an artifact with no _descendants_, while an orphan conventionally has no
parents. In the direction derivation flows it's a leaf, minus the `terminal` types. The parentless
case is `unscoped`.

Two things feed correctly into what counts as "referenced":

- A reference counts whether it's a plain `project-docs-ancestors` citation or a `resolves` one —
  a resolution is a real reference too, even when it's the only field naming the target (the normal
  shape for a hand-authored artifact, before its type earns a generator with a `--resolves` flag
  that would otherwise duplicate the ref into `project-docs-ancestors` for you).
- A type with `terminal: true` is excluded from `unreferenced` entirely, regardless of descendant count.

### `status.resolution`

`status.resolution` in `.nx-agent/lineage.json` splits every artifact whose type has
`tracksResolution: true` into `open` and `resolved`:

```json
{ "open": ["open-questions:reviewer-authorization"], "resolved": ["blockers:cant-ship-payment-flow"] }
```

"Resolved" means some artifact's own `resolves` field names this key — not merely that something
references it via `project-docs-ancestors`. That distinction matters: a `blocker` or another
`open-question` citing an existing one _because_ it's still unresolved would, under a looser
"anything references it" test, get misread as having resolved it. A deferral (explicitly punted, not
decided) isn't a third computed bucket — it stays `open`, with the _why_ left to the artifact's own
prose, same as `unreferenced` doesn't try to distinguish "temporary" from "abandoned."

### Programmatic access

`@abgov/nx-agent` also exports two read functions — its first public, importable API; everything
else in the package is consumed only via `nx g @abgov/nx-agent:x`. Meant for a caller that needs a
stable contract in JS — an ESLint rule, or a build step resolving context for a file it's about to
touch — not one that wants to parse `.nx-agent/lineage.json` directly, since that file's exact
shape stays an internal implementation detail, free to change as long as these signatures don't.

An **agent** is not that caller, deliberately: the generated `design`, `develop` and `discover`
skills all instruct the agent to run the generator and read `lineage.json`'s `index` and
`violations` instead, on the grounds that calling a JS API isn't something an agent does mid-task.
So the split is agents read the file, JS callers use these functions, gates use `--strict`.

```typescript
import { getAncestors, getDescendants } from '@abgov/nx-agent';

getAncestors(tree, 'apps/my-service/src/routes/collision-reports.ts');
// => [{ type: 'domain-terms', id: 'collision-report' }]

getDescendants(tree, 'domain-terms:collision-report');
// => [{ file: 'apps/my-service/src/routes/collision-reports.ts' }]
```

The two directions have genuinely different costs, which the API makes explicit rather than
hiding: `getAncestors` reads just the one file you ask about (the reference is embedded in it), so
it's always cheap. `getDescendants` has no such shortcut — nothing an artifact stores on itself
says who points at it, since references are backward-only by design — so answering it means
checking every file in the workspace. It rebuilds fresh on every call rather than trusting a
persisted cache that could go stale the moment something changes without `project-docs-lineage`
re-running (measured on this ~14k-file workspace: about 50ms end to end, which is why that's an
acceptable default rather than something worth caching).

Both take an optional `depth` (default `1`, direct parents/children only — pass `Infinity` for the
full ancestry/descendancy). `depth` doesn't change the cost model above, it just decides whether to
pay it: at `depth` 1, `getAncestors` still touches only the one file and `getDescendants` still
does its one full-workspace scan. Beyond that, each function builds the graph once — not once per
hop — and walks it in memory, so asking for `depth: 5` costs the same one-time build as `depth: 2`.
A cycle in the references (two artifacts deriving from each other) terminates correctly rather than
looping forever.

```typescript
getAncestors(tree, 'apps/my-service/src/routes/collision-reports.ts', Infinity);
// everything this file derives from, transitively
```

## `project-docs-report`

Builds a single, self-contained HTML status report from the same data `project-docs-lineage`
computes — a lineage graph (rendered with [Mermaid](https://mermaid.js.org/), inlined so the report
needs nothing from `node_modules` to open), a status summary (counts per type, open vs. resolved,
unreferenced artifacts, broken references), and a per-artifact table. Not committed — like `lineage.json`, it's
100% derived from other files, so it's gitignored automatically at wherever it's actually written.

```bash
npx nx g @abgov/nx-agent:project-docs-report
npx nx g @abgov/nx-agent:project-docs-report --project my-service   # scope to one project
npx nx g @abgov/nx-agent:project-docs-report --noSynthesis          # skip the LLM synthesis cascade
```

Written to `project-docs/report.html` — under the workspace root by default, or under the scoped
project's own root when `--project` is given, so the report always lands next to the artifacts it's
actually reporting on rather than in a new top-level directory. `--outputPath` overrides this.

Unlike `project-docs-lineage`, this never throws on a broken reference — surfacing exactly that kind
of bad news is the point of a status report, not something to gate on.

Graph nodes and table rows are colored by status — resolved, open, unreferenced, or (a distinct style,
with a "Closed out" badge and a `✓` in the graph) a `terminal`-typed artifact like an
`iteration-retrospective`, so a permanently-zero-descendant close-out reads as done rather than
looking like ordinarily unreferenced.

Each artifact's own markdown body — rendered to real HTML via [marked](https://marked.js.org/), not
shown as raw source — is one click away: both its table row and its graph node link to an in-page
detail panel (`#artifact-<key>`), shown via plain CSS `:target` rather than any script, so it stays
part of the same single file.

### `--project` scoping

`registry`/`index`/`violations` are always computed over the full workspace first, unconditionally —
an artifact's unreferenced/resolved status is a workspace-wide fact, and building the index from only one
project's files would misclassify anything referenced across a project boundary (a cross-project
reference is real, not a mistake). `--project` filters what's _rendered_, not what's computed: the
summary/counts/table include only that project's own artifacts; the graph additionally shows each
in-scope artifact's direct ancestors even when they're workspace-level or in another project — as
dimmed context nodes, so edges never dangle, but excluded from the table and counts. Descendants
outside the project aren't pulled in.

### Synthesis

A prose summary of project status, generated by shelling out to whichever already-authenticated
coding-agent CLI is available — no new dependency, no separate API key to provision. Cascades
through `claude -p` (Claude Code, if on `PATH`), then `gh copilot -p` (checked via the `copilot`
binary directly, not `gh`, so an absent Copilot CLI is never silently auto-downloaded just to check),
falling back to a deterministic summary computed straight from the same counts shown elsewhere in
the report when neither is available or `--noSynthesis` is passed. The report always states plainly
which path produced its summary, rather than varying silently between environments.

## `agent-delivery`

Sets up the Discover/Design/Develop/Deploy (DDDD) workflow: copies the four skill files into
`.claude/skills/`, plus the `check-example-mapping.mjs` gate script Discover's own skill relies on,
and appends a short guidance section to `AGENTS.md` pointing at them.

```bash
npx nx g @abgov/nx-agent:agent-delivery
npx nx g @abgov/nx-agent:agent-delivery --githubActions   # + a self-dispatching iteration loop
```

Every copied file is write-if-missing — a team's own edits to a skill file, or to the workflow,
survive a re-run. Re-running after an upgrade only adds files that weren't there before; it never
overwrites what's already present.

### Options

| Option                                                                                                                        | Default | Description                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `githubActions`                                                                                                               | `false` | Additionally scaffold a self-dispatching GitHub Actions iteration loop — `.github/workflows/agent-delivery-iteration.yml`, its harness/task-identification scripts, and a `learnings.md` header — for driving the same skills autonomously across many iterations, instead of a human or an orchestrating tool driving them one at a time. |
| `provisionSecrets`                                                                                                            | `false` | Best-effort, non-interactive provisioning of the scaffolded workflow's own GitHub repo secrets/variables — see below. No effect unless `githubActions` is also `true`. Requires `@abgov/nx-oc`.                                                                                                                                            |
| `project`                                                                                                                     | —       | Scope `provisionSecrets`'s project-derived values to one project's own `sandbox` target/tags. Auto-detected across the workspace when omitted.                                                                                                                                                                                             |
| `openshiftServer`, `openshiftToken`, `openshiftNamespace`, `adspEnv`, `adspTenantName`, `adspTenantRealm`, `adspClientSecret` | —       | Explicit value for the correspondingly-named secret/variable — used verbatim by `provisionSecrets`, skipping derivation entirely for that one. No `adspClientId` option: it's always the fixed `adsp-cli-ci` client ID.                                                                                                                    |
| `maxIterations`                                                                                                               | —       | Explicit `MAX_ITERATIONS` value for `provisionSecrets` to write. Optional either way — the workflow already defaults to `6` when unset.                                                                                                                                                                                                    |
| `accessToken`                                                                                                                 | —       | Pre-obtained ADSP admin-scoped access token for `provisionSecrets`'s ADSP lookups — skips any `adsp-cli` login attempt, matching every `nx-adsp` app/service generator's own `--accessToken`.                                                                                                                                              |
| `overwriteExisting`                                                                                                           | `false` | Let `provisionSecrets` overwrite a secret/variable that already exists on the repo. Default is to always leave an existing one unchanged.                                                                                                                                                                                                  |

### `--githubActions` setup

The scaffolded workflow needs repo secrets and variables it doesn't set itself: secrets
`OPENSHIFT_SERVER`, `OPENSHIFT_TOKEN`, `ADSP_CLIENT_ID`, `ADSP_CLIENT_SECRET`; variables `ADSP_ENV`,
`ADSP_TENANT_NAME`, `ADSP_TENANT_REALM`, `OPENSHIFT_NAMESPACE`, and optionally `MAX_ITERATIONS`
(defaults to `6`).

`--provisionSecrets` automates most of this on a best-effort basis, once at least one app/service
has been scaffolded (and, for `OPENSHIFT_*`, sandboxed):

```bash
npx nx g @abgov/nx-agent:agent-delivery --githubActions --provisionSecrets
```

It derives `OPENSHIFT_NAMESPACE` from a project's own `sandbox` target, `ADSP_ENV`/
`ADSP_TENANT_NAME` from the tags every app/service generator already writes, `ADSP_TENANT_REALM`
from a live (re-)resolution of the tenant name, `ADSP_CLIENT_ID` as the fixed `adsp-cli-ci`
constant, and `ADSP_CLIENT_SECRET` via a Keycloak admin lookup — using an `oc`/`gh` login already
active on this machine, or an explicit option/`--accessToken` in place of any of them. It **never**
overwrites a secret/variable that already exists on the repo unless `--overwriteExisting` is also
passed, and reports anything it couldn't determine as a warning with the exact next step. There's
no requirement to run this before or after any other generator — see the generator's own
`provision-github-secrets.ts` header for exactly how each value degrades when the state it'd
otherwise read doesn't exist yet.

Two things it deliberately never automates, reported as warnings with exact manual steps instead:

- **The tenant's `adsp-cli-ci` Keycloak client being disabled.** It's bootstrapped disabled at
  tenant creation — a tenant admin has to enable it and generate its secret via the Keycloak admin
  console (Clients → `adsp-cli-ci` → Settings → enable → Credentials tab → regenerate). This is a
  real tenant-level decision, not something a generator should do on anyone's behalf.
- **The org-level Copilot CLI billing policy** — a GitHub org admin console setting, not a repo
  secret or variable, needed for the workflow's own `copilot-requests: write` permission to
  actually authenticate.
