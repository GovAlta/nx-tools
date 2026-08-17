---
name: handoff
description: Wraps up a completed agent-delivery iteration — squashes any WIP commits into clean conventional ones and writes a meaningful PR body, preparing the branch for human review.
allowed-tools: Read, Write, Bash
---

## Purpose

This skill runs immediately after the main DDDD skill completes. It has two jobs:

1. Squash any WIP/checkpoint commits into clean conventional commits
2. Write a PR body that a human reviewer can actually use

The branch boundary — `git merge-base HEAD origin/main` — is the single reference point for
both jobs. Using it for both means the commit history and the PR body tell the same story at
the same granularity, and there's no per-iteration state to track.

## Steps

### 1. Read the branch boundary

```bash
BOUNDARY=$(git merge-base HEAD origin/main)
git log --oneline "$BOUNDARY..HEAD"
```

### 2. Assess commit quality

Read each commit message between the boundary and HEAD. A commit is **clean** when it follows
Conventional Commits format (`type(scope): description`) with a meaningful description.
A commit is **WIP** when its message is: "WIP", "wip", "checkpoint", "tmp", "save", "fix",
a bare filename, or similarly uninformative. If every commit is already clean, skip step 3.

### 3. Squash WIP commits (only when needed)

```bash
BOUNDARY=$(git merge-base HEAD origin/main)
git fetch origin
git reset --soft "$BOUNDARY"
git restore --staged .github/agent-delivery-iteration/
git diff --cached --stat
```

Unstaging `.github/agent-delivery-iteration/` keeps harness bookkeeping (history.json,
pr-body.md) out of the substantive commits — otherwise a previous iteration's pr-body.md
gets swept into the next squash. The staged diff now contains everything that changed this
branch. Make 1–3 clean commits:

- `feat(<scope>): <what was added>` for new capability
- `fix(<scope>): <what was corrected>` for a bug fix or incorrect behaviour
- `chore(<scope>): <what was updated>` for configuration, docs, or tooling

`<scope>` is the Nx project name (`nx-adsp`, `nx-agent`, `nx-oc`, etc.) or a meaningful
logical scope like `agent-delivery`.

Then force-push to replace the WIP commits on the remote:

```bash
git push --force-with-lease origin "HEAD:$(git branch --show-current)"
```

### 4. Write the PR body

```bash
BOUNDARY=$(git merge-base HEAD origin/main)
git log --oneline "$BOUNDARY..HEAD"
git diff --stat "$BOUNDARY..HEAD"
```

Also scan changed files for `// project-docs-ancestors:` comments and any `resolves:` fields
in committed project-docs artifacts — these link the code back to the requirements it
satisfies and belong in the summary.

Write to `.github/agent-delivery-iteration/pr-body.md`:

```markdown
## Summary
<!-- 2–4 bullets: what was implemented or fixed, referencing project-docs artifact slugs -->

## Changes
<!-- Bulleted breakdown of what changed and why, grouped by concern -->

## Test plan
<!-- Which gates passed: packages tested/built/linted, any e2e target run -->

## Artifacts advanced
<!-- project-docs artifacts moved forward this iteration: slug, type, and new status -->
```

### 5. Done

`ensure-completion-pr.sh` runs in the same job and reads `pr-body.md` directly from disk —
no commit needed. The handoff is complete.
