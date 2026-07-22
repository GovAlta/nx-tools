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

4. **One consolidated `AGENTS.md` section**, `## Working with a coding agent`, with one `###`
   subsection per capability:
   - **Pre-commit checks** — steers self-checking proactively after a meaningful chunk of work,
     not after every edit, using a wider command scoped to the whole feature branch rather than
     just what's staged (`npx nx affected -t lint,test,build --base=main`).
   - **Secret scanning** — names the specific risk for a coding agent: live session secrets (a
     `gh auth token`, a `.env` value, a test API key) it may paste literally where a human
     wouldn't as instinctively catch itself, and steers toward environment-variable references
     instead.
   - **Choosing dependencies** — guidance only, no hook, no new devDependency. Steers checking the
     registry for a package's actual current version/maintenance state rather than defaulting to
     what's recalled from training data (which has a cutoff), and treating a missing/unlicensed
     package or a copyleft license (`GPL`, `AGPL`, `LGPL`) as a stop-and-ask signal rather than
     something to resolve unilaterally.

   The whole section is centrally maintained: re-running `init` refreshes it in place rather than
   leaving it frozen at first-generation wording, and each subsection is contributed by its own
   capability so the file reads as one coherent reference rather than a growing flat list of H2s.
   `init` is also self-migrating — if it finds the older per-capability section markers used
   before this consolidation, it removes them and writes the merged section in their place, so
   simply re-running `init` is enough to pick up the new structure; no separate migration step.

### Options

| Option | Default | Description |
|---|---|---|
| `targets` | `lint,test,build` | Targets run by both the pre-commit hook and the AGENTS.md guidance's self-check command |
| `base` | `main` | Base branch used only in the AGENTS.md guidance's self-check command (not the pre-commit hook, which always diffs against staged changes) |

```bash
npx nx g @abgov/nx-agent:init --targets=lint,test --base=develop
```
