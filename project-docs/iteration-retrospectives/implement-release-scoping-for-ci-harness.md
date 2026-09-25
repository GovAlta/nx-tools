---
title: implement release scoping for CI harness
project-docs-ancestors:
  - requirements:release-artifact-type-with-generator
  - requirements:ci-harness-derives-artifact-scope-from-active-release-artifact
  - domain-models:release-scoping
  - cli-designs:release-generator
  - cli-designs:task-identification-release-scope
resolves: []
---

Delivered the full Discover → Design → Develop pipeline for `features:release-scope`.

**What was built:**
- `nx g @abgov/nx-agent:release <name>`: creates `project-docs/releases/<slug>.md` with
  `release-name`, `project-docs-ancestors` (features in scope), and a goal-statement placeholder.
  Registers the `releases` type in `artifact-schema.json` on first use. Fails loudly on duplicate.
  Slugification strips dots so `v1.0` → `v1-0` (matching the slug charset).
- `task-identification.mjs` (workspace + template): when `ARTIFACT_SCOPE` is unset, reads
  active `project-docs/releases/` artifacts and builds `scopedPaths` from their `features:`
  ancestors. Warns on malformed YAML or dangling feature refs. Explicit `ARTIFACT_SCOPE` takes
  precedence unchanged.
- `project-docs-refs.ts`: added `.mjs` to `REF_SOURCE_EXTENSIONS` so `task-identification.mjs`
  and other `.mjs` scripts' `project-docs-ancestors` comments are picked up by the lineage scanner.

**Found along the way:**
- Independent review caught 5 issues: missing lifecycle rule (open question added to req-013
  rule-5), x-prompt example rewritten as a schema-inspection assertion, diagnostic output channel
  made concrete (stdout), dangling-feature-reference rule added (req-014 rule-5), YAML-parse-
  error rule added (req-014 rule-6).
- Lineage scanner didn't cover `.mjs` files — fixed as part of wiring the code-comment tracing.

**Deploy gate:** `.github/workflows/release-ci.yml` confirmed present. `npx semantic-release
--dry-run` fails with SSH auth error (no key in this session) — not a config issue; the `feat:`
commit types on this branch will trigger a minor bump on merge to main. Behavior verified through
unit tests (371 pass); no e2e project exists for nx-agent (gate is test + build + lint only).
