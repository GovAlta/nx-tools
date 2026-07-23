**Project conventions.** Before writing something new, check how similar things are already done
in this codebase and match that pattern, rather than introducing an equally-valid but different
one. A codebase with five ways of doing the same thing is harder to maintain than one with a
single, slightly-imperfect way applied everywhere. This applies to generated documentation too —
if a `project-docs/` folder exists, it's the convention home for that kind of artifact; match its
established shape (one file per instance, YAML frontmatter for structured fields, free text for
the rest) even when adding a kind of artifact it doesn't have a subfolder for yet.
