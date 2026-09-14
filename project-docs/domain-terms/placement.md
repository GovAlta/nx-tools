---
term: Placement
aliases: [first placement]
not_confused_with: [upgrade, re-copy, configuration]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

Writing the declared distribution set from a resolved source into a target that has no harness, as
one act that either completes or writes nothing.

Placement is the operation the harness itself does not implement and deliberately refuses; it is
the reason this capability exists. It is distinguished from an **upgrade**, which merges into a
target that already carries a harness and is the harness's own tool's job, and from
**configuration**, which happens afterwards in the project's own session and is outside this
boundary entirely.

Placement carries two obligations that are easy to state as afterthoughts and are not: every path
it writes is confined to the target, and it preserves the execute bit the source declares — which
means placement installs an executable that runs on a developer's machine, sourced from a resolved
source, and is why the source is pinned.
