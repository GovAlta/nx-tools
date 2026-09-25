---
title: release scope
project-docs-ancestors: []
resolves: []
---

A `release` artifact type that bounds which features are in scope for a given release, so the
CI harness's DDDD loop only picks up signals descending from those features rather than the full
backlog. Motivated by observed scope creep on the keystone installer: the harness worked on 52
rules and 1,478 lines for what should have been a ~650-line job because there was no committed
boundary.

The release artifact should be durable (committed to the repo, not a per-dispatch parameter),
reviewable (first-class in the artifact graph), and readable by the CI harness automatically so it
derives `artifact_scope` from the release without requiring a human to set it correctly on every
dispatch.

Shape: `release-name` (frontmatter identity), `project-docs-ancestors` pointing at the relevant
product-brief or features, and a goal statement in the body ("a developer can do X when this
release ships"). Generator guides the caller to write the goal. No budget/line counts — the goal
statement is the only scoping criterion.
