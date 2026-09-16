---
title: Record the placed harness provenance in the project
id: req-008
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: placement writes a JSON record with named fields for the source, the requested ref, the resolved commit, and the placement time
    examples:
      - "Given: init has placed the harness from a fetched ref;
         When: the run finishes;
         Then: the target carries a JSON file whose fields name the source repository, the ref asked
         for, the commit it resolved to, and an ISO-8601 placement timestamp"
    questions: []
  - rule: a local-path source is recorded as such, including when there is no ref to name
    examples:
      - "Given: init has placed from a local path with no ref specified;
         When: the run finishes;
         Then: the record states that the source was a local path and names the commit it resolved
         to, rather than omitting provenance because no ref was asked for"
    questions: []
  - rule: the record names the version of this package that wrote it
    examples:
      - "Given: a project placed by one version of this installer;
         When: a reader inspects the record;
         Then: it states which installer version wrote it, so a defect in placement can be
         attributed to a release"
    questions: []
  - rule: the record is written where the project will commit it, not into ignored runtime state
    examples:
      - "Given: a freshly placed project;
         When: its untracked files are listed against its own ignore rules;
         Then: the provenance record is among the files that would be committed"
    questions: []
  - rule: provenance is never written into the configuration file the project's own configuration step owns
    examples:
      - "Given: a configuration step that refuses to run when its own config file already exists;
         When: init records provenance;
         Then: it writes its own separate file and that config file does not exist afterwards"
    questions: []
  - rule: the record can be read back on demand, so a lost handoff is recoverable without re-fetching the source
    examples:
      - "Given: a placed project whose bootstrap session has been closed, on a machine with no
         access to the source repository;
         When: the status command runs against it;
         Then: it prints the recorded fields, having read only the target"
    questions: []
  - rule: the installer records itself in the target's package manifest as a development dependency
    examples:
      - "Given: a target that carries a package manifest;
         When: init finishes;
         Then: the manifest names this package under development dependencies, so an install
         resolves it and the lockfile carries the exact version"
      - "Given: a placed project with that entry removed;
         When: the harness is used;
         Then: it still works, because nothing the harness runs imports from this package"
    questions: []
questions: []
---

## Rationale

A copy-distributed project has no inherent record of what it is a copy of, which is what makes a
report from it a claim about a tree nobody can identify, and a re-copy a silent overwrite.

The hand-written script did capture the source commit, and then wrote it into a file whose own
closing instruction told the reader to delete it. So the gap is not that provenance was never
computed; it is that nothing durable held it.

**Narrowed 2026-09-11 to what the harness cannot derive.** An earlier version of these rules had
this installer write a parallel record of route, acceptance and a timestamp — duplicating the
harness's own configuration step, which already stamps the version it was built from. The harness
owns describing itself; what it cannot know is the ref and commit a copy was fetched at, because a
copy has no remote. So the record is the repository, the ref, the commit, and which installer wrote
it. A `status` command reading it back is the harness's own health-board skill's job, not this
package's.

The record also has to survive the handoff this bootstrap deliberately ends at. A session that
closes takes its console output with it, so anything a later reader needs must be on disk and
readable back on demand — from the target alone, since needing source access to read back what you
already have would make this the one thing the package does that requires a credential to answer.

What the record must never carry is the credential used to fetch. It is guaranteed-committed by
construction, which makes it the highest-consequence place a tokenized URL could land; see
requirements:never-persist-or-emit-the-source-credential.
