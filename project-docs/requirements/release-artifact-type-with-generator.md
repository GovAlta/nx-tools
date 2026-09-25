---
title: release artifact type with generator
id: req-013
project-docs-ancestors: [product-briefs:agent-delivery-harness, features:release-scope]
resolves: []
rules:
  - id: rule-1
    title: generator creates release file with required frontmatter and goal placeholder
    examples:
      - "Given a workspace with no existing releases/ directory, When `nx g @abgov/nx-agent:release \"v1.0\" --projectDocsAncestors=project-docs/features/release-scope.md`, Then the generator creates `project-docs/releases/v1-0.md` containing `release-name: v1.0` in frontmatter, `project-docs-ancestors: [features:release-scope]`, and a goal-statement body placeholder; and the `releases/` directory is created"
    questions: []
  - id: rule-2
    title: generator registers releases type in artifact-schema.json on first use
    examples:
      - "Given `releases` is not yet in `artifact-schema.json`, When any release generator invocation runs, Then `artifact-schema.json` gains `\"releases\": { \"expectedAncestorTypes\": [\"features\"] }` after the run"
      - "Given `releases` is already registered, When the generator runs again, Then `artifact-schema.json` is unchanged (idempotent)"
    questions: []
  - id: rule-3
    title: duplicate release-name fails loudly with no side effects
    examples:
      - "Given `project-docs/releases/v1-0.md` already exists, When `nx g @abgov/nx-agent:release \"v1.0\"` is run, Then the generator throws an error naming the existing file and writes nothing to the tree"
    questions: []
  - id: rule-4
    title: schema.json declares x-prompt on the releaseName field
    examples:
      - "Given the generator's `schema.json`, When the `releaseName` property is inspected, Then it has an `x-prompt` field so Nx's interactive mode presents the question to the caller"
    questions: []
  - id: rule-5
    title: archiving a release artifact removes it from the active scope
    examples:
      - "Given `project-docs/releases/v1-0.md` exists and is active, When the file is moved to `project-docs/archive/releases/v1-0.md` (by any means), Then `project-docs-lineage` no longer counts it as an active release and task-identification no longer includes its ancestors in Release Scope"
    questions:
      - "Can the existing `archive` generator handle a single-file non-feature artifact, or does archiving a release require a manual move or a dedicated archive path for releases?"
questions: []
---

## Rationale

The CI harness has no durable record of which features belong to a release. Every dispatch
requires a human to set artifact_scope manually. A `releases` artifact type records the intent
durably: which features constitute the release, expressed as a generator-authored file with a
`release-name` identity field and a human-readable goal statement. The generator is the entry
point — the same way `feature` and `requirement` generators bootstrap the convention rather than
having authors hand-author files.

A release artifact is active until archived — archiving is the exit signal that tells the harness
the delivery cycle is complete, the same lifecycle pattern every other artifact in the graph uses.
