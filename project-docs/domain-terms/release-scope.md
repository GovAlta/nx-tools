---
term: Release Scope
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

The set of features eligible for signal processing in a CI harness iteration, derived from the
union of all `project-docs-ancestors` of type `features:` across all active Release Artifacts.

When at least one active Release Artifact exists, the Release Scope is computed automatically by
the task-identification script — no human needs to set `artifact_scope` on the workflow dispatch.
When no active Release Artifact exists, the Release Scope is unconstrained (the full backlog is
eligible).

An explicit `artifact_scope` workflow input takes precedence over the Release Scope when both are
present — this preserves the human override path for targeted investigations.
