---
title: Keystone bootstrap installer
project-docs-ancestors: []
resolves: []
---

Publish a sixth package in this suite, `@abgov/keystone`, that places the Keystone harness into a
project for the first time.

Keystone is a Claude Code harness maintained in its own repository (`GovAlta-EMU/keystone`, which is
not public) and distributed **by copy** — no symlinks, no paths back to the source, and a fix reaches
a project only when someone re-copies it. It already implements **re-copy** into a project that has
it, and deliberately refuses a fresh directory. **Nothing places it into a new project.**

The consequence is measured, not hypothetical: every machine that bootstraps these projects has
grown its own install skill, by hand, unversioned. One reviewed example hardcodes another
developer's home directory, copies a file that is gitignored and therefore absent from a clean
clone, names a harness command that does not exist, and carries a stale count of the harness's own
checks. Its hook wiring is also incomplete, so projects it created had a pre-commit secret scan
that could never fire.

So the capability wanted is **first placement, as a versioned artifact instead of per-machine
folklore**:

- `npx @abgov/keystone init` in an empty or non-workspace directory places the harness and stops at
  a handoff. It must resolve *what to place* from the source's own declared distribution manifest
  rather than carrying its own file list — a second copy of that list is the same defect the
  hand-written install skills have.
- `npx @abgov/keystone upgrade` in a directory that already has the harness delegates to the
  harness's own upgrade tool, which owns the merge rules. This package adds no merge logic.
- It must pin itself into the project so the project has a durable record of which harness it is on
  and where that came from. The hand-written skill captured that and wrote it into a file whose own
  instructions then told the reader to delete it.
- It must not run any harness command itself. Those resolve against the new project's own
  configuration and hooks, which only take effect once an editor is launched rooted in the project
  directory — so bootstrap necessarily ends at a handoff and the project's own setup runs in a fresh
  session.

Decisions already taken, which are constraints on this rather than questions for it:

- **Fetch now, bundle later.** The package carries no harness content initially: it fetches the
  source at a ref. Source resolution is a seam with three implementations (a local path, a fetch, and
  eventually content bundled in the tarball) so the default can move without changing the CLI.
- **It defers the organizational floor to `@abgov/nx-agent:init` when the target is already an Nx
  workspace**, and only wires things itself in a bare project where no generator can run.
- **Its own version line**, like `@abgov/nx-agent`, not this suite's Nx-major-minus-ten convention:
  it is not an Nx plugin and peers no `@nx/*` package.
- **Published to public npm** under this scope, so a consumer needs no registry credential. Access to
  the harness source is still required to fetch it, which is no regression — that access is already a
  prerequisite for obtaining the harness at all.
- **Repair via the Nx ecosystem is the future direction**, not part of this: the harness's own upgrade
  contract can replace a file or preserve it and cannot transform one, and `nx migrate` is the
  mechanism that closes that gap. It is workspace-only, so the delegate above stays permanently for
  bare projects.

The detailed implementation plan, and everything specific to the harness's own internals, lives
outside this repository deliberately — this repository is public and that one is not. What belongs
here is the package's own behaviour.
