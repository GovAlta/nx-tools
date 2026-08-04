---
name: develop
description: Implement an api-design/ux-design against real code, following the project's own generated recipe (its own AGENTS.md — the exact steps vary by stack), with a project-docs-ancestors code comment tying every new file back to the design it implements. Runs an inline gate battery — audit, secret scan, build, test, always blocking — plus an independent code review, every pass, advisory.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
argument-hint: "<api-design or ux-design slug to implement>"
---

## Which artifact

- **If a `bugs:<slug>` is the given/top signal, that's a different flow — see "Bug fixing" below,
  not the api-design/ux-design steps in this section.**
- **If a specific api-design or ux-design slug is given, implement that.**
- **If an external prioritization directive exists for this initiative** (orchestrator- or
  human-supplied — e.g. "UI-first this round," "backend-first"), follow it. Deciding priority
  across several ready candidates is policy, not something this skill decides for itself.
- **If neither is given**, enumerate undesigned api-designs/ux-designs under the current
  initiative (a domain-model ancestor exists, but no corresponding code yet) and pick one with no
  unresolved `blockers:`/`open-questions:` artifact naming its domain-model ancestor — readiness,
  not "whichever is more concrete to implement." Say so explicitly if this default ends up
  favoring backend over UX (or vice versa) in a given case.
- **When a ux-design is picked ahead of its paired api-design's own implementation**, the frontend
  has nothing real to run against yet. Generate an MSW (Mock Service Worker) layer transcribed
  directly from that api-design's own documented request/response shapes (status codes, response
  bodies already in its frontmatter) — a frontend devDependency plus a generated handler file, not
  a new service or deploy target. Strictly a prototyping aid for stakeholder UI feedback before the
  backend track completes — say so explicitly in the mock layer's own file (which api-design it was
  transcribed from, and that it's prototype-only), and never treat it as a substitute for the real
  e2e/smoke verification once the backend track exists.

## Bug fixing

A `bugs:<slug>` is an as-built behavior defect, not a design gap — investigate and fix directly,
no Design pass needed:

1. **Read the bug's own body** (observed vs. expected behavior) and, if `project-docs-ancestors`
   names one, the requirement/design it's already believed to implicate. If it names none, find
   the implicated code yourself before assuming which api-design/ux-design is at fault — a bug
   report from outside the system usually doesn't know this yet.
2. **Reproduce it first.** Don't fix what you haven't confirmed — a bug report can itself be wrong
   (stale environment, a since-fixed dependency, a misunderstanding of intended behavior).
3. **Check the fix against the existing spec, not a new one.** If the implicated requirement/design
   already has a Given/When/Then example covering this behavior and the code simply doesn't satisfy
   it, that's a pure implementation defect — fix the code, no artifact needs revising. Verify with
   the existing e2e spec (the same one Develop's own Gate below already runs), extended with a case
   for this bug if one doesn't already exist.
4. **Escalate to a real `blocker` only if the spec itself is wrong** — the design never covered this
   case, or covered it incorrectly. Run `nx g @abgov/nx-agent:blocker "<what's wrong>"
   --projectDocsAncestors=<implicated artifact> --projectDocsAncestors=<this bug, for traceability>`
   (blocker accepts more than one ancestor), then fix the artifact for real before continuing.
   The bug stays `open` until step 5 resolves it — the blocker being resolved doesn't close the bug.
5. **Resolve the bug once the fix (code-only or design-plus-code) is verified**: run
   `nx g @abgov/nx-agent:iteration-retrospective "<title>" --projectDocsAncestors <path> [...]
   --resolves=<this bug's path>` at Deploy, naming it the same way any other resolution is recorded
   — there's no separate "close this bug" step, and no new mechanism beyond what `open-question`/
   `blocker` already use.

## Steps

1. **Read the api-design/ux-design** this pass implements, and its domain-model ancestor. Also
   run `npx nx g @abgov/nx-agent:project-docs-lineage` (without `--dry-run`) and read
   `.nx-agent/lineage.json`'s `index` entry for that domain-model (or its bounded-context ancestor)
   to see what other code already exists building on the same domain concepts — a sibling resource
   may have already implemented shared logic this pass should reuse.

2. **Follow the project's own recipe end to end** — check its `AGENTS.md` for its exact "Recipe:
   add a resource"/"Adding a new route" section (naming varies by stack — an `express-service`'s
   own recipe reads nothing like a `react-app`'s) and match it; don't improvise a different shape,
   and don't assume any one stack's shape as a default — each app-type generator's own generated
   `AGENTS.md` is the actual, authoritative, stack-specific answer, already complete on its own. If
   a platform or design-system MCP server is connected, prefer it over recalling SDK/component APIs
   from memory. If scaffolding this resource just created or changed `.mcp.json`, say so explicitly
   and note a reconnect is needed before that server is usable.

3. **Every new file gets `// project-docs-ancestors: <api-design or ux-design ref>`** near the top
   — the code-comment form of the frontmatter convention. This is what lets the gate below trace
   code back to the design that justified it.

4. **A precondition or invariant the domain model states belongs in the testable core logic, not
   the thin orchestration layer that talks to whatever's calling in.** For an HTTP-backed resource,
   that's the service layer, not the router — the router's job is HTTP shape only (status codes,
   validation, auth). If the domain model says something must never exist, model that as the
   service throwing before persistence, and let the router map the thrown type to the right status
   code. The same split holds for any other shape a resource might take — a React component vs.
   the hook/slice underneath it, a CLI command's argument parsing vs. its underlying logic — the
   orchestration layer stays thin and dumb, the invariant lives in code that's testable without it.

5. **Write tests from the design's own Given/When/Then examples, not by mirroring the
   implementation.** Mock the service layer for router tests (HTTP-shape only); test a
   service-level invariant directly and in isolation when it doesn't need a database to exercise.

6. **If implementing this design surfaces a real gap in the api-design/ux-design or domain
   model** — don't quietly patch around it in code. Run `nx g @abgov/nx-agent:blocker "<what's
   wrong>" --projectDocsAncestors=<path>` naming the artifact that needs fixing, then get it fixed
   upstream before continuing, or park this pass and pick up other work if one exists.

## Gate — run before ending this skill

```
npx nx test <service>
npx nx e2e <service>-e2e
npx nx build <service>
npx nx lint <service>
npx secretlint <changed files>
npm audit --audit-level=high
npx nx g @abgov/nx-agent:project-docs-lineage
```

Test/build/lint/secret-scan/lineage are always blocking, no exception. `<service>-e2e`'s own
blocking status depends on whether this project has a CI backstop yet — see below.

- **Test/build/lint failures** block outright.
- **`<service>-e2e`** (or its equivalent for whatever this resource actually is) exercises the real
  thing the way a real consumer would — not mocked. For a runtime service, that means building and
  serving the app locally, then hitting it. For something with no running server at all — an Nx
  generator, a CLI command — the equivalent is running it for real against a scratch fixture
  workspace/input and asserting on its actual output or side effects, not a unit test that mocks
  the very thing being verified. If the scaffolded e2e project's own spec is still the generic
  starter, that's not a passing gate — write real cases from the design's Given/When/Then examples
  first. The same spec file should also work verbatim against a live deployment via `BASE_URL`
  (see Deploy's Gate — the same `e2e` target, not a separate one, once
  `global-setup.ts`/`global-teardown.ts` guard on `BASE_URL`).

  **Blocking status depends on graduation.** `.openshift/<project>/<project>.yml` (written by
  `@abgov/nx-oc:deployment`) signals the project is in the real pipeline, whose CI already runs
  this as a hard gate before merging.
  - **Not graduated (sandbox-only, the default)**: blocking — nothing else will ever run this suite.
  - **Graduated**: advisory — still run it, but a failure doesn't have to hold up ending the pass;
    say so explicitly when committing past one.
  - Either way: scope early in-pass runs to just the rule(s) touched (Playwright `--grep`, jest
    `--testNamePattern`); reserve a full untargeted run for this Gate.
- **Unit-test coverage** is a real, additional guard — check the project's own `jest.config.cts`
  for `coverageThreshold`; if `collectCoverage` is on but no `coverageReporters` prints a summary
  by default, make it visible, not just enforced.
- **Secret scan** blocks on any match.
- **`npm audit`** blocks only on a finding introduced by *this* change. A high-severity finding
  already present in scaffolding before this pass touched anything is drift to flag, not a reason
  to block.
- **`project-docs-lineage`**'s broken-reference check blocks as always. Its orphan/unscoped report
  should be empty by the time a resource's code exists and correctly references its api-design.

### Independent code review — every pass

Give the reviewer only the api-design/ux-design, the
domain terms it should be consistent with, and the new/changed code — never this pass's own
reasoning. Ask it: does the code use a term inconsistently with the domain vocabulary (naming
included — a generic implementation-layer word standing in for a domain noun is drift too)? Is
anything more elaborate than the design calls for? Is anything unclear? Does the code implement
everything the design specifies, and nothing it doesn't? Always advisory — act on a real finding
by fixing it or by updating the design doc when the code's approach is the better one, don't just
log it.

### Commit before ending this skill

Commit the implementation once every blocking check above passes —
`feat(develop): implement <resource> against <api-design/ux-design>` — covering the new code, its
tests, and the `project-docs-ancestors` comment tying it back to the design, together as one unit.
