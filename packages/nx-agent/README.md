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

2. **An `AGENTS.md` guidance section** telling a coding agent the hook exists and steering it to
   self-check proactively — after a meaningful chunk of work, not after every edit — using a wider
   command scoped to the whole feature branch rather than just what's staged:

   ```sh
   npx nx affected -t lint,test,build --base=main
   ```

   This section is centrally maintained: re-running `init` refreshes its wording in place rather
   than leaving it frozen at first-generation content.

### Options

| Option | Default | Description |
|---|---|---|
| `targets` | `lint,test,build` | Targets run by both the pre-commit hook and the AGENTS.md guidance's self-check command |
| `base` | `main` | Base branch used only in the AGENTS.md guidance's self-check command (not the pre-commit hook, which always diffs against staged changes) |

```bash
npx nx g @abgov/nx-agent:init --targets=lint,test --base=develop
```
