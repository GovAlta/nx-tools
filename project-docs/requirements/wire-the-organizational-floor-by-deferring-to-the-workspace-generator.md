---
title: Wire the organizational floor by deferring to the workspace generator
id: req-009
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: where the target is a workspace, the floor is applied by invoking this suite's own floor generator, and this package writes no wiring of its own
    examples:
      - "Given: a target carrying both a package manifest and a workspace configuration;
         When: init wires the floor;
         Then: it invokes the suite's own floor generator, and makes no hook configuration call
         itself"
    questions: []
  - rule: where the target carries a manifest but is not a workspace, the floor generator still cannot run, so this package wires it and adds the re-apply step to the manifest already there
    examples:
      - "Given: a target with a package manifest and no workspace configuration;
         When: init wires the floor;
         Then: it configures the hook path itself and adds the re-apply step to the existing
         manifest, rather than writing a second one"
    questions: []
  - rule: where the target carries neither, this package wires the hook path and writes a minimal manifest to carry the re-apply step
    examples:
      - "Given: a target with neither a package manifest nor a workspace configuration;
         When: init wires the floor;
         Then: it configures the hook path directly and writes a minimal manifest whose re-apply
         step restores it on a later install"
    questions: []
  - rule: an existing hook path configuration is never silently replaced
    examples:
      - "Given: a target whose repository already configures a hook path of its own;
         When: init wires the floor;
         Then: it exits non-zero naming the existing value, because replacing it would disable
         whatever check the team already had there"
    questions: []
  - rule: the hook path is treated as per-clone rather than as a one-time install step
    examples:
      - "Given: a project this package wired, committed and then cloned by a teammate;
         When: that teammate installs and commits;
         Then: the pre-commit check runs for them too, because the re-apply step is committed rather
         than living only in the original clone's local configuration"
    questions: []
  - rule: the floor's artifacts come from the placement rather than from any other repository
    examples:
      - "Given: a source whose declared distribution already carries the floor's artifacts;
         When: init wires the floor;
         Then: those artifacts are the placed ones, and wiring adds only the configuration that no
         file can carry"
    questions: []
  - rule: the handoff names the harness's own preflight rather than this installer running it
    examples:
      - "Given: a freshly placed and wired target;
         When: init finishes;
         Then: it names the harness's own preflight step for the caller to run, rather than
         invoking the floor gate itself — the harness already has a skill whose job is checking
         this copy and its environment, and running it here duplicated a harness capability"
    questions:
      - "Which version of the floor generator should the workspace path invoke, and what should
         happen when it is absent from the target or fails? The whole workspace path rests on that
         external contract and nothing here pins it."
questions: []
---

## Rationale

The organizational floor is defined by a generator already published in this suite, and that
generator is the definition rather than one implementation of it. A second implementation here
would be the same artifact with two producers, which is how the two drift apart.

But that generator cannot run everywhere. It needs a manifest and a workspace, and the target this
package exists for frequently has neither — which is the whole reason this is a published binary
and not a generator.

So the target's own shape decides: where a workspace exists, defer; where none does, wire the
minimum directly. The one fact that has to be wired either way is per-clone rather than committed,
so it is not a one-time install step at all — every later clone of the project needs it too, and a
teammate who clones and commits without it gets a pre-commit check that cannot fire.
