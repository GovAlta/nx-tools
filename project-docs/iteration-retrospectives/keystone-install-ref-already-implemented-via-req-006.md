---
title: keystone install ref already implemented via req-006
project-docs-ancestors: [features:keystone-install-ref, product-briefs:keystone-installer, requirements:resolve-the-harness-source-from-a-local-path-or-a-fetched-ref, cli-designs:keystone-init]
resolves: []
---

The feature requested allowing `keystone init` to accept a `--ref` (tag/branch/commit) option.
Investigation found this is already fully implemented: `--ref <tag|branch|sha>` is a documented CLI
flag, wired through `chooseRoute` → `fetchSource`, written to provenance (`.keystone/install.json`),
and emitted in JSON output. req-006 covers all the rules, and `cli-designs:keystone-init` specifies
the contract in interface points 4–5. Integration tests in `fetch-source.integration.spec.ts`
exercise the ref with a release tag, main branch, and a commit directly.

What this pass did:

- Traced `features:keystone-install-ref` to `req-006` and the product brief (Discover)
- Added `requirements:resolve-the-harness-source-from-a-local-path-or-a-fetched-ref` formally to
  `cli-designs:keystone-init`'s ancestors — it was referenced only in prose, not in frontmatter
  (Design)
- Confirmed all tests pass, build clean, lint clean (Develop — no new code needed)

Deploy: `release-ci.yml` confirmed present. `npx semantic-release --dry-run` failed on SSH
(`git ls-remote` via `git@github.com`) which is an environment constraint, not a workflow problem.
No code changed in this pass, so no version bump is expected.
