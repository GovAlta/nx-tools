---
cli-design: release-generator
project-docs-ancestors: [domain-models:release-scoping]
resolves: []
---

## Command

```
nx g @abgov/nx-agent:release <releaseName> [--projectDocsAncestors <paths>]
```

## Options

| Option | Type | Prompt | Required | Description |
|---|---|---|---|---|
| `releaseName` | string (positional, `$source: argv index 0`) | "What is the release name (e.g. v1.0, 2025-Q4)?" | yes | Human-readable label; slugified to derive the file path |
| `projectDocsAncestors` | array of strings | none | no | Paths to existing `project-docs/features/*.md` files this release scopes |

## Behavior

**Pre-flight** (all preconditions checked before any file is written):
1. `releaseName` is non-empty
2. `project-docs/releases/<slug>.md` does not already exist (fails loudly, names the path)
3. Every path in `projectDocsAncestors` exists in the workspace (same validation as other generators)

**On success**:
- Writes `project-docs/releases/<slug>.md` with the shape described in the domain model
- Registers `releases` in `artifact-schema.json` with `{ "expectedAncestorTypes": ["features"] }` (idempotent)
- Bootstraps `project-docs/releases/README.md` on first use
- Calls `formatFiles(host)` at the end

**On failure** (throws, no file written):
- Duplicate: `[nx-agent] project-docs/releases/<slug>.md already exists — edit it directly rather than regenerating it.`
- Invalid ancestor path: names the missing path

## File template

```markdown
---
release-name: <releaseName>
project-docs-ancestors: [<resolved ancestor refs>]
---

<!-- Goal statement: what a developer can do when this release ships.
     Example: "A developer can scaffold a release-scoped workspace with
     a single command that creates the project-docs/releases/ entry and
     the CI harness picks it up automatically." -->
```

## Tracing to requirements

| Behavior | Requirement |
|---|---|
| File creation, frontmatter shape, goal placeholder | req-013 rule-1 |
| `artifact-schema.json` registration and idempotency | req-013 rule-2 |
| Duplicate guard (fail loudly, no write) | req-013 rule-3 |
| `x-prompt` on `releaseName` in schema.json | req-013 rule-4 |
