---
title: Delegate upgrade of an existing copy to the harness upgrade tool
id: req-007
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: upgrade invokes the resolved source's own upgrade tool against the target, as a spawned process
    examples:
      - "Given: a target that already carries the harness, and a resolved source;
         When: upgrade runs;
         Then: the source's own upgrade tool is spawned with the target as its argument, and it is
         the process that writes"
    questions: []
  - rule: this package writes nothing to the target during an upgrade, beyond its own provenance record
    examples:
      - "Given: the delegated tool replaced by one that does nothing;
         When: upgrade runs and then its own provenance write is disabled;
         Then: the target is byte-identical to before, which is what proves this package holds no
         merge, preserve or regenerate logic of its own"
    questions: []
  - rule: a refusal by the delegated tool leaves the target unchanged and fails the whole command
    examples:
      - "Given: a target the delegated tool refuses to upgrade;
         When: upgrade runs;
         Then: the command exits non-zero, and the target's files are byte-identical to before —
         asserted against the target rather than against what the command printed"
    questions:
      - "This assumes the delegated tool signals refusal by status. What should happen if a future
         version of it refuses on a success status with only a message?"
  - rule: a successful upgrade rewrites this package's own provenance record, and a refused one leaves it alone
    examples:
      - "Given: a project whose record names the commit it was originally placed from;
         When: upgrade succeeds against a newer commit;
         Then: the record names the newer commit, so the project's stated provenance is what it now
         carries rather than what it was born with"
      - "Given: the same project;
         When: upgrade is refused;
         Then: the record is unchanged"
    questions: []
  - rule: upgrade refuses a target that does not carry the harness, and names init instead of doing its job
    examples:
      - "Given: a target with files of its own but no harness directory;
         When: upgrade runs;
         Then: it exits non-zero naming the init command, before the delegated tool is spawned at
         all, so the refusal is this package's own precheck rather than the tool's"
    questions: []
  - rule: the plan-versus-apply default is read from the delegated tool's own convention rather than restated here
    examples:
      - "Given: a delegated tool whose own default is to plan unless told to apply;
         When: upgrade runs with no apply flag;
         Then: it plans and writes nothing, matching that default, so a mistyped flag cannot read as
         a completed upgrade"
    questions: []
questions: []
---

## Rationale

Placing into an empty tree is the case the harness declines; merging into a tree that already has
a copy is the case it solves, in a large and carefully-reasoned tool whose rules about what a
project keeps are declared alongside the content itself.

Reimplementing any of that here would put a second opinion about what a project owns into a
different repository from the declaration it came from. The rule this requirement exists to protect
is that this package carries no merge logic and no view of its own about what survives an upgrade.

It also has to fail the same way the tool it calls fails. A wrapper that swallows that distinction
turns a safe refusal into an apparent success — and the check for it is the target's own files, not
what the wrapper printed about them.

The one thing this package does write during an upgrade is its own provenance record, which is its
artifact rather than harness content. Without that carve-out a project's recorded provenance would
name the commit it was born from forever, which is the versioned-artifact claim failing on every
upgrade after the first.

"Carries the harness" means the harness directory is present. A damaged or partial copy is the
delegated tool's judgment to make, not this package's.
