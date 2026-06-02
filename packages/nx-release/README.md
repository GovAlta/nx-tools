# About this project
This is the Government of Alberta - Nx plugin for Semantic Release.

The project contains both the Nx plugin generator for setting up a monorepo with semantic release
configuration as well as a plugin for semantic release. 

## Semantic release / monorepo
There are multiple challenges with using semantic release in a monorepo:
1. Each release project needs distinct release tags.
2. Each project should be evaluated based on only commits related to it.
3. Interdependencies between projects need to be handled.
4. Interdependencies between publishable/releasable projects require coordination of releases.
5. Channel (next-major, next, latest) information is stored in a git note on a semantic-release ref and does not distinguished between tags (and consequently projects).

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
