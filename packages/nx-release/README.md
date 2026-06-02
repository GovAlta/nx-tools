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
5. Channel (next-major, next, latest) information is stored in a git note on a commit and is not distinguished between tags (and consequently projects) when multiple projects share a commit.

For (1), (2), and (3) in part this project uses the approach from [semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo) along with Nx capabilities: 
- Each project uses a distinct `tagFormat`; 
- A custom plugin wraps default plugins for `analyzeCommits` and `generateNotes` and filters for only relevant commits;
- Nx `graph` is used to determine dependency paths that should also be included.

(4) is not currently handled, but a solution leveraging Nx capabilities is the general direction. For example, Nx supports ordered execution of tasks based on 'affected'.

### Channel promotion for shared-commit releases (5)

When multiple projects release on the same commit (e.g. on a `next` branch with no intervening commits between project releases), promoting them all to `latest` requires special handling.

**Root cause:** Semantic-release stores each tag's channel state as a git note under a per-tag ref (`refs/notes/semantic-release-<tagName>`). However, git notes are stored on the commit object the tag points to, not on the tag object itself. When multiple tags share a commit, each tag has its own note ref but all notes live on the same commit.

Semantic-release reads these notes using a glob (`--notes=refs/notes/semantic-release*`), which causes git to emit all matching notes for that commit in a single log line. Only the first note retains its tag association in the `git log` output — the rest appear on subsequent lines with no tag decoration and are discarded. After the first project is promoted (its note updated to include `null` channel), the shared commit's combined note output maps all tags to the first note's updated channels, making every remaining project appear to already be on the `latest` channel.

**Fix:** This package exports a `verifyConditions` lifecycle step that runs before semantic-release's `getReleaseToAdd` decision. It re-reads each tag's channel state by querying its specific note ref directly:

```
git notes --ref semantic-release-<tagName> show <tagName>
```

This bypasses the glob-based read entirely and corrects `context.branch.tags` in place before `getReleaseToAdd` consults it. Because `@abgov/nx-release` exports `verifyConditions` as a named function, semantic-release will invoke it automatically for any project already configured with `["@abgov/nx-release", { "project": "..." }]` — no config change is required.

**Dependency on semantic-release internals:** This fix relies on two implementation details of semantic-release that are not part of its public API:

1. **Execution order** — `verifyConditions` must run after `getBranches` (which populates `context.branch.tags`) but before `getReleaseToAdd` (which reads channel state from `context.branch.tags`). This is the order in `semantic-release/index.js` as of v24. If semantic-release moves `getReleaseToAdd` before `verifyConditions`, the fix will stop working.

2. **Note ref naming convention** — The note ref for a tag is `refs/notes/semantic-release-<tagName>`. This is defined by `GIT_NOTE_REF` in `semantic-release/lib/definitions/constants.js`. If this naming convention changes, `verifyConditions` will fail to find the notes and silently fall back to the (incorrect) glob-read channels.

If either of these internals changes in a future semantic-release version, this fix will need to be revisited. The correct long-term fix is an upstream change to `getTagsNotes` in semantic-release to query note refs individually rather than via glob, which would eliminate the cross-contamination between tags on shared commits.
