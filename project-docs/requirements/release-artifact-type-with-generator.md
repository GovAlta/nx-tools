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
    title: generator prompts for release-name in interactive sessions
    examples:
      - "Given no `--releaseName` argument is passed, When the generator is invoked interactively, Then the CLI displays `x-prompt` asking for the release name before proceeding"
    questions: []
questions: []
---

## Rationale

The CI harness currently has no durable, committed boundary for which features are in scope for a
given release. Every dispatch requires a human to set `artifact_scope` correctly; nothing in the
repo records what the current release intends to deliver. This means a harness session started
without careful `artifact_scope` input works the full backlog — the root cause of the keystone
installer scope creep (52 rules/1,478 lines for a ~650-line job).

A `releases` artifact type records the intent durably: which features constitute the release,
expressed as a generator-authored file with a `release-name` identity field and a human-readable
goal statement. The generator is the entry point — the same way `feature` and `requirement`
generators bootstrap the convention rather than having authors hand-author files.
