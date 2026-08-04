---
project-docs-ancestors: []
resolves: []
---

Observed: when task-identification finds no eligible signals, it still pushes `{ key: 'none',
lineageFingerprint }` to history.json and the workflow commits it — a spurious commit on every
no-work run.

Expected: history.json is only written when a real signal is present. A no-work run has nothing
to stall on and nothing to record.

Secondary: 'none' entries corrupt stall detection. A real signal recurring across runs that
include a no-work gap never reaches the stall threshold because the recent window contains
mismatched keys.

Affected file: `packages/nx-agent/src/generators/agent-delivery/files/github-actions/scripts/task-identification.mjs`
