---
title: keystone install ref
project-docs-ancestors: []
resolves: []
---

Allow `nx g @abgov/keystone:init` (or a dedicated install command) to accept a ref, tag, or
branch name so a developer can install a specific version of Keystone rather than always
getting the latest default. Useful for testing a pre-release, pinning to a known-good tag
before promoting, or reproducing an issue against a specific commit.
