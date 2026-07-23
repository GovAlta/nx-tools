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
   against your *staged* changes before every commit:

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

### Options

| Option | Default | Description |
|---|---|---|
| `targets` | `lint,test,build` | Targets run by both the pre-commit hook and the AGENTS.md guidance's self-check command |
| `base` | `main` | Base branch used only in the AGENTS.md guidance's self-check command (not the pre-commit hook, which always diffs against staged changes) |

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
---

<!-- Definition: describe this term in the domain's own language. -->
```

- `term` — the canonical name, matching the filename.
- `aliases` — other words that mean the same thing.
- `not_confused_with` — similar-sounding terms this one is deliberately distinct from, and why.

One file per term rather than a single flat glossary, so frontmatter (a per-file construct in
every tool that uses the term) is meaningful, and so listing the folder — cheap, just filenames —
is enough to check the existing vocabulary before coining a new name.

Also bootstraps `project-docs/domain-terms/README.md` on first use, explaining the convention to
whoever (human or agent) opens the folder next. That file has no value on its own — it exists only
to explain the convention for the term about to be added — so there's no separate "set up the
glossary" generator; `domain-term` composes it as an internal step.

### Options

| Option | Default | Description |
|---|---|---|
| `term` | — (required, positional) | The canonical domain term, as domain experts use it |
| `project` | workspace root | Scope the term to a specific project's `project-docs/domain-terms/` instead — use when a bounded context spans a domain library and its consuming apps |

```bash
npx nx g @abgov/nx-agent:domain-term Case --project=domain-lib
```

Re-adding a term that already exists throws rather than silently overwriting or duplicating it —
edit the file directly instead.
