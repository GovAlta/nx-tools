---
title: Placement implemented and verified against the real harness
project-docs-ancestors: [product-briefs:keystone-installer, requirements:place-the-harness-from-the-declared-distribution-set, domain-models:harness-placement, cli-designs:keystone-init]
resolves: []
---

One requirement — placement — taken from intake to a verified run. Discover also seeded and
example-mapped the other seven requirements of this initiative; none of them is designed or
developed yet.

## Status, stated because the two halves diverge

**The placement capability is verified working end to end.** Run against the real harness source:
519 files placed, and the harness's own content hash over the placed tree equals the source's, which
is the acceptance criterion — an identity-identical copy reports no drift on its first update.

**The package is not shippable**, and that is not a caveat on the above but a separate fact.
Fetching is unimplemented, so `init` requires a local source path; the update path, the provenance
record, floor wiring and the handoff are undeveloped; and the placeholder publish that has to
precede a trusted publisher has not happened. The release wiring itself is confirmed — every
plugin loads and the only thing preventing a publish is the branch.

## What was found and fixed along the way

The reference graph shows the artifacts as they ended up. These are the things that were wrong on
the way there, all of them found by the independent reviews each stage runs rather than by the
gates:

- **The product brief invited the misreading that mattered most.** Five of seven requirement
  reviewers independently read "provider, not a dependency" as forbidding the self-pin into the
  target's manifest that the owner had decided on. The invariant is about what the harness needs,
  not what the project records, and the brief now says so.
- **A credential-leak path the requirement set created between two of its own members.**
  Provenance is committed by construction and a failed fetch prints a remediation, so a tokenized
  remote URL reaches version control or a log by the ordinary path. Neither requirement was wrong;
  the combination was, which is why it became its own requirement rather than a caveat on each.
- **The trust resolution's first draft leaned on the control its own open question had
  disqualified.** It claimed pinning the repository turns the source identity check into a real
  control on the local-path route. Pinning fixes what the check compares against — which bounds a
  fetch, because a fetch cannot then be redirected — but the declaration is part of the tree being
  judged, so a hostile local tree declares whatever it likes. The honest version states that the
  local route is bounded by the caller's own authority and records the agent-versus-human asymmetry
  as accepted residual risk.
- **Two confinement escapes in the implementation, both verified by running the code.** A dangling
  symlink in the target read as absent, so a collision went unreported and the copy then followed
  the link and wrote outside the target — with no hostile source required. And confinement was
  lexical, so a pre-existing symlinked directory carried writes out. The fix's own first attempt
  resolved only one side, which on macOS made every path in a temp directory read as an escape,
  because `/tmp` and `/var` are themselves symlinks.
- **A one-syscall window** in which a placed file existed wider than its bound, on the hook that
  runs at every commit.
- **`--target=<dir>` silently ignored**, placing into the working directory instead — for a command
  whose own design says a placement into the wrong directory is not undoable.
- **The implementation had quietly acquired a copy of the source's semantics**, implementing this
  package's own idea of how the source's include list matches a path. That is the single thing this
  capability exists to avoid, and it arrived as a fallback for an older source shape that nothing
  asked for.

## What this pass changed about how the work is checked

Several specified behaviours had no test because nothing could call the command: the exit statuses,
the payloads, and four of six refusal messages the design states are asserted. Extracting the
command into a function over its arguments and its output channels is what made the contract
testable at all, and it is the shape the remaining requirements should extend rather than a
convenience for this one.

The fixture tree that stands in for a harness source lives in a directory excluded from both the
build output and the publish allowlist — the control one of the open requirements declares, doing
work here rather than being declared.
