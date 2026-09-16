---
title: End bootstrap at a handoff without running a harness command
id: req-010
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: no executable from the placed tree is run by this package
    examples:
      - "Given: a target where placement has just completed;
         When: init finishes;
         Then: no process was spawned from a path inside the placed tree, because the harness's own
         commands resolve against the new project's configuration and hooks and those bind only to
         a session rooted there"
    questions:
      - "The floor check in requirements:wire-the-organizational-floor-by-deferring-to-the-workspace-generator
         is run from the placed tree by design. Is that the single sanctioned exception, or should it
         be run some other way?"
  - rule: the handoff names the configuration step and the directory a fresh session must be rooted in
    examples:
      - "Given: a completed placement into a known target directory;
         When: the handoff prints;
         Then: its text contains the configuration step's declared name and that target's path"
    questions: []
  - rule: a harness command named in the handoff is one the resolved source declares, and is a bare declared identifier rather than a command line
    examples:
      - "Given: a source that declares its configuration step under a particular name;
         When: the handoff prints;
         Then: the name printed is the one the source declares, so this package cannot go on naming
         a command that no longer exists"
      - "Given: a source whose declared name contains shell metacharacters or whitespace;
         When: the handoff prints;
         Then: it refuses to print that name as an instruction, because the handoff is read and run
         by a person or an agent and the source is fetched content"
    questions: []
  - rule: a source declaring no configuration step is stated as such, never guessed at or omitted
    examples:
      - "Given: a resolved source that declares no configuration step this package recognizes;
         When: the handoff prints;
         Then: it says so explicitly and names no command, rather than printing an empty step"
    questions: []
  - rule: re-running init against an already-placed target reprints the handoff and writes nothing
    examples:
      - "Given: a placed project whose bootstrap session printed the handoff and was then closed;
         When: init is run against that target again;
         Then: the handoff is printed again, nothing is written, and the update path is not entered,
         because updating is the upgrade command's job"
    questions: []
questions: []
---

## Rationale

The harness's own commands resolve against the new project's configuration and hooks, and those
only take effect once an editor session is rooted in the project directory. A bootstrap session is
by definition not that session, so running one from here would resolve against the wrong context
and dirty the very baseline it just created.

That makes the stop a correctness property rather than a convenience. The hand-written script had
the boundary right and stated it plainly; what it got wrong was the instruction on the other side
of the boundary, naming a command that does not exist for three months without anything noticing.

A handoff that is only printed is also lost the moment the session closes, so it has to be
recoverable by asking again rather than by remembering. Reading the record back is
requirements:record-the-placed-harness-provenance-in-the-project; what this requirement owns is
that asking again is safe and changes nothing.

Deriving the named step from the source is what stops this package restating a name that can go
stale — and it makes fetched content into printed instruction, which is why the name has to be a
bare declared identifier and nothing more.
