---
title: Place the harness from the declared distribution set
id: req-005
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: the file universe is the source's git-tracked files, intersected with the source's own declared distribution predicate
    examples:
      - "Given: the resolved source carries an installed dependency cache and a generated file, both
         gitignored, inside directories the declaration does carry;
         When: init places the harness;
         Then: neither is written to the target"
    questions: []
  - rule: a path the declaration excludes does not travel, and a path positively named as an exception inside an excluded directory does
    examples:
      - "Given: the source's declaration excludes a directory and names one path inside it as an exception;
         When: init places the harness;
         Then: the target carries that named path and nothing else from that directory"
    questions: []
  - rule: the declared set is read from the resolved source at run time, never from a list carried by this package
    examples:
      - "Given: a source that still carries a git-tracked file on disk, at a path its declaration
         no longer names;
         When: init places from that source, with no change to this package;
         Then: the path is absent from the target, so an implementation reading a list of its own
         could not pass"
    questions: []
  - rule: file mode is preserved, so a placed hook is executable
    examples:
      - "Given: the source's pre-commit hook file is executable;
         When: init places the harness;
         Then: the placed file is executable"
    questions: []
  - rule: a source carrying no distribution declaration is refused before anything is written
    examples:
      - "Given: a resolved source whose manifest has no distribution declaration;
         When: init runs against it;
         Then: it exits non-zero naming the source's own version, and the target is untouched"
    questions: []
  - rule: placement refuses rather than overwriting a target file it did not place
    examples:
      - "Given: a target with no harness but with its own file already at a path the declaration
         carries;
         When: init runs;
         Then: it exits non-zero naming that file, and writes nothing, because first placement is
         the case this is for and clobbering a partly-set-up project is not sanctioned by it"
    questions: []
  - rule: every written path is confined to the target, and the mode bits that travel are bounded
    examples:
      - "Given: a declaration naming a path that is absolute, or that traverses above the target, or
         a git-tracked symlink pointing outside it;
         When: init places;
         Then: it exits non-zero naming the path, and writes nothing outside the target"
      - "Given: a source file carrying mode bits beyond owner-execute;
         When: init places it;
         Then: the placed file carries execute where the source had it and nothing wider, since the
         declaration is remote input and a placed hook runs on the developer's machine at every commit"
    questions: []
  - rule: init refuses a target that already carries the harness, and names upgrade instead of doing its job
    examples:
      - "Given: a target that already carries a harness directory;
         When: init runs;
         Then: it exits non-zero naming the upgrade command, and writes nothing"
    questions: []
questions: []
---

## Rationale

The harness refuses a fresh directory by design, so a new project has no way to receive it. That
gap is why bootstrap became a hand-written script on every machine that needed one, and those
scripts copy from whatever a working clone happens to contain rather than from a declared set.

The measured consequences of copying a clone: a generated, ignored file that is present or absent
depending on whose machine it is; a quarter-gigabyte dependency cache in a project that wanted none
of it; and the project's own ignore rules silently bypassed, because a recursive filesystem copy is
not ignore-aware.

**A plan-without-writing rule was removed 2026-09-11**, having been added in Design's own pass to
justify a `--dry-run` flag. Inspecting a placement before performing it is genuinely useful, but it
was scope this installer invented rather than scope the capability needs, and it is the clearest
instance of a pattern worth naming: "add the rule in Discover rather than invent scope in Design"
is correct, and a one-way ratchet if nobody asks whether the rule should exist.

The intersection is also a leak control, not only a determinism and size fix: ignored files in a
working clone are exactly where credentials sit, and a fetch credential is in play during the same
operation. An option to include them would not be a convenience.

Reading the source's own declaration is what makes this durable rather than another snapshot of one
day's file list. The harness declares what travels in one place, and a copy of that declaration
living here would drift from it exactly as the hand-written scripts did — which is the defect, not
an implementation detail of it.
