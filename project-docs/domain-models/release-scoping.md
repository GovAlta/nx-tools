---
name: Release Scoping
project-docs-ancestors:
  - bounded-contexts:agent-delivery-harness
  - domain-terms:release-artifact
  - domain-terms:release-scope
  - requirements:release-artifact-type-with-generator
  - requirements:ci-harness-derives-artifact-scope-from-active-release-artifact
resolves: []
---

## Release Artifact

A **Release Artifact** is a file at `project-docs/releases/<slug>.md` with this shape:

```
---
release-name: <human-readable release label>
project-docs-ancestors: [features:<slug>, ...]
---

<goal statement: "a developer can X when this release ships">
```

The `release-name` field is the identity key (what the generator prompts for). The
`project-docs-ancestors` list names the `features:` entries whose signals are in scope for
this release — one or more. The body carries the goal statement; the generator provides a
placeholder but the caller must fill it in.

**Invariant**: `releases` is registered in `artifact-schema.json` with
`"expectedAncestorTypes": ["features"]`. The generator writes this registration on first use
(idempotent on repeat). The `permanent: false` default applies — release artifacts can be
archived once a delivery cycle closes.

**Active vs. archived**: a release artifact is active while it lives in `project-docs/releases/`.
Moving it to `project-docs/archive/releases/` removes it from scope derivation. The question of
whether the existing archive generator handles this path directly is open — see req-013 rule-5's
open question.

---

## Release Scope Derivation

The Release Scope is computed by the task-identification script from the union of all
`features:` ancestors across all active Release Artifacts:

```
active releases = all files in project-docs/releases/ (not in archive/)
for each active release:
  parse frontmatter (skip and warn if malformed YAML)
  for each project-docs-ancestors entry of type features:
    resolve to a real artifact key (warn and skip if missing from the registry)
    add that key to the eligible-features set
Release Scope = union of eligible-features sets
```

**Precedence**: an explicit `artifact_scope` workflow input takes precedence when set. The
script checks for `artifact_scope` first; if non-empty, it uses that input directly and skips
release-file processing entirely.

**Fallback**: if no active release artifacts exist (and `artifact_scope` is empty), scope is
unconstrained — full backlog eligible, same as today.

---

## Generator Contract

The `@abgov/nx-agent:release` generator:

1. Accepts `releaseName` as a required positional argument (with `x-prompt` for interactive use)
2. Accepts `projectDocsAncestors` as an array of feature paths
3. Derives the file slug from `names(releaseName).fileName`
4. Fails loudly if `project-docs/releases/<slug>.md` already exists (no partial writes)
5. Calls `ensureArtifactSchemaEntry(host, 'releases', ['features'])` — registers once, idempotent
6. Writes the file with `release-name`, `project-docs-ancestors`, and a goal-statement placeholder
7. Bootstraps `project-docs/releases/README.md` on first use (same pattern as other generators)

---

## Diagnostics

When the task-identification script derives scope from release artifacts, it writes to stdout:
- One line per active release, naming the release file and the features it contributed
- One warning per malformed release file (skipped, not a hard failure)
- One warning per dangling feature reference (skipped, not a hard failure)

These diagnostics are written before the signal loop, so the scope is visible in CI logs before
any task selection output.
