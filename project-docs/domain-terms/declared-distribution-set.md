---
term: Declared distribution set
aliases: [declared set, distribution set, travel predicate, distribution declaration]
not_confused_with: [the source's tracked files, the source's working tree]
project-docs-ancestors: [bounded-contexts:harness-installation]
resolves: []
---

The set of paths the source itself declares travel into a project, expressed as a declaration the
source carries rather than as a list of files.

Two halves of one thing, and both names are in use: the **declaration** is the data the source
carries, and the **travel predicate** is the source's own function that applies it. This installer
reads the first through the second and holds neither.

It is **the source's answer, not the installer's**. The installer reads it from the resolved source
at run time and applies the source's own predicate; it holds no copy of the list and no opinion
about the contents. A carried copy is precisely what went stale in the hand-written installers this
capability replaces, so "we read it" is the definition rather than an implementation note.

The set is narrower than the source's tracked files: the declaration excludes paths, and names
exceptions inside excluded directories that travel anyway. It is also narrower than the source's
working tree, which is where untracked and ignored files live — those are not part of any
distribution, and the intersection with the tracked files is what excludes them.
