---
layout: page
title: NX Release plugin
nav_order: 4
has_children: true
---

<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

# @abgov/nx-release

Nx plugin for configuring [semantic-release](https://semantic-release.gitbook.io/semantic-release/) in an Nx monorepo.

The plugin generates a `.releaserc.json` for a publishable library that handles the challenges of running semantic-release across multiple packages in the same repository. It also exports the semantic-release plugin used internally by the generated configuration.

## Installation

```bash
npm i -D @abgov/nx-release semantic-release
```

## Quick start

```bash
# Generate semantic-release configuration for a publishable library
npx nx g @abgov/nx-release:lib my-lib
```

### Generator options

| Option | Required | Description |
|--------|----------|-------------|
| `project` | Yes | Name of the publishable Nx library to configure |

The generator writes a `.releaserc.json` into the project directory with monorepo-safe configuration: per-project tag formats, commit filtering scoped to the project via Nx graph traversal, and coordinated multi-package release notes.

Run it once per publishable library in the monorepo.

## Running releases

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

(4) is not currently handled, but a solution leveraging Nx capabilities is the general direction.

---

## Known issue: channel promotion with multiple projects

**Affected versions:** semantic-release v24.2.7 and later

Non-prerelease channel promotion (`next` → `latest`) only promotes the first project when multiple projects have release tags on the same commit. Prerelease channels (alpha, beta) are **not** affected.

### Root cause

Semantic-release v24.2.7 introduced a performance optimisation ([#3732](https://github.com/semantic-release/semantic-release/pull/3732)) that replaced per-tag note reads with a single `git log` command using a glob. When multiple projects release on the same commit, the glob causes git to emit all matching notes in a single log line where only the first note retains its tag association. After the first project is promoted to `latest`, every remaining project appears to already be on the latest channel.

A fix is tracked upstream at [semantic-release#4074](https://github.com/semantic-release/semantic-release/pull/4074).

### Workarounds

**Option 1 — Pin to the last unaffected version:**

```json
"semantic-release": "24.2.6"
```

v24.2.6 is the last version before the regression.

**Option 2 — Ensure no two project tags share a commit on `next`:**

Add a trivial commit between each project's release run so that every release tag lands on a distinct commit.
