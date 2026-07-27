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
     project's own established patterns, and following framework/library idioms.
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
---

<!-- Definition: describe this term in the domain's own language. -->
```

- `term` — the canonical name, matching the filename.
- `aliases` — other words that mean the same thing.
- `not_confused_with` — similar-sounding terms this one is deliberately distinct from, and why.
- `project-docs-ancestors` — other `project-docs/` artifacts this term derives from (see
  `project-docs-lineage` below) — set via `--project-docs-ancestors`, never by hand.

One file per term rather than a single flat glossary, so frontmatter (a per-file construct in
every tool that uses the term) is meaningful, and so listing the folder — cheap, just filenames —
is enough to check the existing vocabulary before coining a new name.

Also bootstraps `project-docs/domain-terms/README.md` on first use, explaining the convention to
whoever (human or agent) opens the folder next. That file has no value on its own — it exists only
to explain the convention for the term about to be added — so there's no separate "set up the
glossary" generator; `domain-term` composes it as an internal step.

### Options

| Option            | Default                  | Description                                                                                                                                            |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `term`            | — (required, positional) | The canonical domain term, as domain experts use it                                                                                                    |
| `project`         | workspace root           | Scope the term to a specific project's `project-docs/domain-terms/` instead — use when a bounded context spans a domain library and its consuming apps |
| `projectDocsAncestors` | none                     | Paths to existing `project-docs/` artifacts this term derives from — repeatable; resolved into `project-docs-ancestors` (see below)                         |

```bash
npx nx g @abgov/nx-agent:domain-term Case --project=domain-lib
npx nx g @abgov/nx-agent:domain-term "Collision Report" --project-docs-ancestors=project-docs/bounded-contexts/collision-reporting.md
```

Re-adding a term that already exists throws rather than silently overwriting or duplicating it —
edit the file directly instead. A `--project-docs-ancestors` path that doesn't resolve to an existing
artifact throws the same way, before anything is written.

## `project-docs-lineage`

Scans the whole workspace for `project-docs/` artifacts and `project-docs-ancestors` references —
across both doc frontmatter and code comments — and writes the resulting graph to
`.nx-agent/lineage.json` (gitignored automatically; it's fully derived from other files, so
committing it would just create a second, driftable source of truth). Throws if it finds a
reference that doesn't resolve to anything; reports an artifact nothing references yet (an orphan)
without failing, since that's a normal, temporary state, not a mistake.

```bash
npx nx g @abgov/nx-agent:project-docs-lineage
npx nx g @abgov/nx-agent:project-docs-lineage --dry-run   # compute and report, write nothing
```

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

Not yet wired into the pre-commit hook or an Nx inferred plugin — run it yourself (or `--dry-run`
it in your own CI) after adding or changing a reference.

### Programmatic access

`@abgov/nx-agent` also exports two read functions — its first public, importable API; everything
else in the package is consumed only via `nx g @abgov/nx-agent:x`. Meant for a caller that needs a
stable contract (an ESLint rule, an agent resolving context for a file it's about to touch), not
one that wants to parse `.nx-agent/lineage.json` directly — that file's exact shape stays an
internal implementation detail, free to change as long as these signatures don't.

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
