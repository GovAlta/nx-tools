# @abgov/nx-release

Nx plugin for configuring [semantic-release](https://semantic-release.gitbook.io/semantic-release/) in an Nx monorepo.

The plugin generates a `.releaserc.json` for a publishable library that addresses the challenges of running semantic-release across multiple packages in the same repository. It also exports the semantic-release plugin used internally by the generated configuration.

## TLDR

```bash
# 1. Install
npm i -D @abgov/nx-release semantic-release

# 2. Generate semantic-release configuration for a publishable library
npx nx g @abgov/nx-release:lib my-lib
```

## Quick Start

### Prerequisites

- A publishable Nx library with a `package.json` and a configured `build` target
- `semantic-release` installed as a dev dependency

### Installation

```bash
npm i -D @abgov/nx-release semantic-release
```

### Generate configuration

```bash
npx nx g @abgov/nx-release:lib my-lib
```

| Option | Required | Description |
|--------|----------|-------------|
| `project` | Yes | Name of the publishable Nx library to configure |

The generator writes a `.releaserc.json` into the project directory with monorepo-safe configuration: per-project tag formats, commit filtering scoped to the project via Nx graph traversal, and coordinated multi-package release notes. Run it once per publishable library.

### Running releases

```bash
# Release a single library
npx nx run my-lib:semantic-release

# Release all affected libraries
npx nx affected --target=semantic-release
```

---

## Monorepo challenges

There are multiple challenges with using semantic-release in a monorepo:

1. Each release project needs distinct release tags.
2. Each project should be evaluated based on only commits related to it.
3. Interdependencies between projects need to be handled.
4. Interdependencies between publishable/releasable projects require coordination of releases.
5. Channel (next-major, next, latest) information is stored in a git note on a semantic-release ref and does not distinguish between tags (and consequently projects).

For (1), (2), and (3) in part this project uses the approach from [semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo) along with Nx capabilities:
- Each project uses a distinct `tagFormat`;
- A custom plugin wraps default plugins for `analyzeCommits` and `generateNotes` and filters for only relevant commits;
- Nx `graph` is used to determine dependency paths that should also be included.

(4) is not currently handled, but a solution leveraging Nx capabilities is the general direction. For example, Nx supports ordered execution of tasks based on 'affected'.

**KNOWN ISSUE** (5) Non-prerelease channel promotion (`next` → `latest`) only promotes the first project when multiple projects have release tags on the same commit. Prerelease channels (alpha, beta) are not affected — see below.

### Why prerelease channels are not affected

Prerelease branches (those with `prerelease: true` in the semantic-release config) are assigned `type: "prerelease"` internally. The channel promotion logic in `getReleaseToAdd` only considers branches of `type !== "prerelease"` when determining which versions need to be added to the current branch's channel. This means alpha/beta releases are never candidates for `addChannel` promotion and are unaffected by this issue.

### Root cause

Semantic-release v24.2.7 introduced a performance optimisation ([#3732](https://github.com/semantic-release/semantic-release/pull/3732)) that replaced per-tag note reads with a single `git log` command using a glob (`--notes=refs/notes/semantic-release*`). When multiple projects release on the same commit, each tag has its own note ref but all notes land on the same commit object. The glob causes git to emit all matching notes for that commit in a single log line where only the first note retains its tag association — subsequent notes appear on continuation lines with no tag decoration and are discarded. After the first project is promoted to `latest` (its note updated to include `null` channel), the combined output maps all tags on that commit to that updated note, making every remaining project appear to already be on the latest channel.

A fix is tracked upstream at [semantic-release#4074](https://github.com/semantic-release/semantic-release/pull/4074). Until that merges and is released there are two workarounds:

**Option 1 — Pin semantic-release to the last unaffected version:**
```json
"semantic-release": "24.2.6"
```
v24.2.6 (released 2025-06-29) is the last version before the regression. v24.2.7 introduced it.

**Option 2 — Ensure no two project tags share a commit on `next`:**
Add a trivial commit between each project's release run on the `next` branch so that every release tag lands on a distinct commit.
