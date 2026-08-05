---
project-docs-ancestors: []
resolves: []
---

## Observed

When a hand-authored `project-docs/` artifact has invalid YAML frontmatter (e.g. a
single-character indentation error in a multi-line string), the lineage tool silently
drops it and reports it as "unscoped" — as if the file had no `project-docs-ancestors`
field at all.

## Expected

The tool should surface the filename and the js-yaml parse error so the author knows
immediately which file is broken and why, instead of leaving them to diagnose an
"unscoped" report by running js-yaml directly.

## Steps to reproduce

1. Create a `project-docs/` artifact with a multi-line YAML string that has an
   indentation error (e.g. a continuation line indented one space less than required).
2. Run `npx nx g @abgov/nx-agent:project-docs-lineage --dry-run`.
3. The artifact appears in "unscoped" rather than its expected lineage position; no
   parse error is reported.

## Root cause (suspected)

The YAML parse in the lineage tooling catches the js-yaml exception and falls through
to the "no frontmatter" path rather than re-throwing or logging it.

## Fix scope

Try/catch around the js-yaml `load()` call in the artifact reader; on catch, emit a
warning to stderr with the filename and the js-yaml error message, and skip (or
optionally abort) rather than silently treating the artifact as frontmatter-free.
