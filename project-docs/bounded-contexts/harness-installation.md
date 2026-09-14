---
name: Harness installation
aliases: [bootstrap, first placement]
not_confused_with: [harness configuration, harness upgrade merge rules, workspace repair]
project-docs-ancestors: []
resolves: []
---

Harness installation is everything involved in getting a copy of the harness into a project and
recording what that copy is. It spans resolving a source, writing the declared distribution set
into a target, wiring the one configuration fact no file can carry, recording provenance, and
stopping at a handoff.

**Inside the boundary**

- Resolving a source to a tree and a commit, from the one pinned repository or from a local path.
- Writing the declared distribution set into a target, and refusing rather than overwriting what
  the installer did not place.
- The configuration a placed file cannot carry — the per-clone hook path — and the decision of
  whether to wire it here or defer to the generator that owns the organizational floor.
- Recording provenance of the placed copy, and reading it back.
- Delegating an update of an existing copy, and propagating that delegate's refusal faithfully.
- Not persisting or emitting the credential used to reach the source.

**Outside the boundary**

- **The harness's own content**, and the rules for merging an update into an existing copy. Both
  are declared in the harness and read from it; restating either here is the drift this boundary
  exists to prevent.
- **How a project is configured once placed** — profile, mode, and the rest. That is a judgment
  step, run in a session rooted in the project, and this boundary deliberately ends before it.
- **Repair by transforming already-placed content.** The harness's update contract can replace a
  file or preserve it, not transform one; closing that gap needs a workspace toolchain and is a
  separate capability.
- **What the harness does once it runs.** Nothing in this boundary is needed for the harness to
  work, only to install or update it.
