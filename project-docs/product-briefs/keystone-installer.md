---
capability: Keystone installer
audience: [developers bootstrapping a new Keystone project, AI coding agents doing the same on their behalf]
known-platforms: [npm, github, nx]
questions: []
project-docs-ancestors:
  - features:keystone-bootstrap-installer
  - features:keystone-install-ref
resolves: []
---

`@abgov/keystone` is a published installer for the Keystone harness. It exists to make **first
placement** a versioned artifact rather than per-machine folklore.

Keystone is distributed by copy from its own repository. It already implements re-copy into a
project that has it and deliberately refuses a fresh directory, so nothing places it into a new
project — and every machine that bootstraps these projects has written its own install script by
hand to fill that gap. Those scripts copy from whatever is in a working clone rather than from a
declared artifact set, which is the single cause of most of their defects. A published package with
a declared file list closes that class by construction.

It is a **provider, not a dependency**: deleting it from a project leaves a working harness. It is
needed to place or update the harness, never to run it — nothing the harness runs imports from it.

That invariant is about what the harness _needs_, not about what the project _records_. The project
does name this package in its own manifest, because that is where a version belongs and what puts
the provenance in a lockfile; removing that entry still leaves a working harness, which is the
property to protect.

Outside the boundary: the harness's own content and the rules for merging an update into an
existing copy (both belong to the harness and are read from it, never restated here); how a project
is configured once placed, which is a judgment step run in the project's own session; and repair by
source transformation, which needs a workspace toolchain and is a later, separate capability.

Operating context. **npm** is the distribution channel — this scope's packages resolve from the
public registry with no _registry_ credential, and this one must not be the exception that needs
one. That is a separate credential from the source access below, and only the first is what the
"no credential" claim covers.
**GitHub** is where the harness source lives and where the fetch credential comes from; the source
repository is private, so a consumer needs access to it to fetch, which is no new requirement — that
access is already a prerequisite for obtaining the harness at all. **Nx** is present in some target
projects and absent in others: where a workspace exists, the organizational floor is already owned
by a generator in this suite and must be deferred to rather than reimplemented; where none exists,
no generator can run at all, which is why this is a `bin` and not a generator.
