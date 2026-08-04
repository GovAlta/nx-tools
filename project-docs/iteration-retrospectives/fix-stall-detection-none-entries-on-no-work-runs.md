---
title: fix stall-detection none entries on no-work runs
project-docs-ancestors: [bugs:stall-detection-history-none-entries-on-no-work-runs]
resolves: [bugs:stall-detection-history-none-entries-on-no-work-runs]
---

The bug was confirmed in the template file only: the live `scripts/task-identification.mjs`
had already been patched by hand on the branch, but
`packages/nx-agent/src/generators/agent-delivery/files/github-actions/scripts/task-identification.mjs`
still contained the original `topSignal?.key ?? 'none'` fallback at the history-write site.

Fix applied: wrapped the history push + writeFileSync in `if (topSignal)`, matching the live
script, and added a regression test in `agent-delivery.spec.ts` asserting the template does
not contain `?? 'none'` and does contain the `if (topSignal)` guard.

All 219 unit tests pass; build and lint clean (pre-existing warnings only).
