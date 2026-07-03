# nx-tools — Project Assessment

_Date: 2026-06-29_

Overall the repo is in good shape — tests and lint pass, the recently-modernized
generators (`express-service`, `react-app`, `mern`) are solid, docs are current,
and e2e coverage for nx-adsp is meaningful. The gaps are concentrated in a few
areas, prioritized below.

## Status — Nx 23 migration (PR #273 → `beta`)

The workspace has been migrated to **Nx 23.0.1** (jest 30.3.0); plugins now
require Nx 23 (`^23.0.0` peers — a major release, since versions track the Nx
major). This changes several items below:

- **#3 (audit)** — partially addressed: `23 → 14` vulnerabilities. The moderate
  `webpack-dev-server`/`sockjs`/`uuid` cluster is gone. The remaining 10 highs
  are all from `@nx-dotnet/core`'s bundled old `@nx` tree and are **deferred** —
  they clear when it's replaced (see follow-up below).
- **#5 (executor detection)** — now folded into the `@nx/dotnet` follow-up.
- A `.npmrc` (`legacy-peer-deps=true`) is carried as an interim to tolerate
  `@nx-dotnet/core`'s `nx <23` peer. It resolves the install conflict only; it
  does **not** touch the transitive vulns (overrides are the right tool for
  those, but minimatch spans four incompatible majors in the tree, so a clean
  override isn't available — removing `@nx-dotnet/core` is).

**Top follow-up: replace `@nx-dotnet/core` with the official `@nx/dotnet`.**
`@nx/dotnet` is an inference plugin (no `app`/`nuget-reference` generator, no
build executor), so this is a rewrite of `dotnet-service` plus replacing the
executor-name `switch` in nx-oc `deployment.ts`/`sandbox.ts` (#5) with a robust
app-type signal. It eliminates both the `.npmrc` deferral and the 10 vulns.

## 🔴 High priority — correctness / will bite consumers

_(none outstanding — see reclassified #1 below)_

## 🟡 Medium priority — robustness & consistency

1. **ESLint 8 is end-of-life.**
   `eslint` is on 8.57.1 and `@typescript-eslint` on v7 (v8 current). ESLint 8
   receives no security fixes, and Nx 23 now warns it will be removed in Nx v24.
   Meaningful upgrade (flat-config migration) — should be scheduled before the
   next Nx major.

2. **nx-oc swallows failures.**
   `apply-infra.ts` logs "Failed to oc apply" but doesn't propagate a non-zero
   result, and `deployment.ts:25` parses `environments.yml` with no try-catch.
   Callers/CI can't tell a failed apply from a successful one. nx-release and
   nuget both throw on error — nx-oc is the outlier (log-and-return). Standardize
   on throw.

3. **nx-oc e2e is thin.**
   Only `pipeline` and `apply-infra` have e2e tests — `deployment`, `sandbox`,
   `teardown`, `setup-secrets` (all added recently) have unit tests but no e2e.
   `semantic-release-nuget` has no e2e at all.

4. **`apply-infra.spec.ts:20` writes the wrong path.**
   Test writes `.openshift/environment.env.yml`; code reads
   `.openshift/environments.yml`. Test passes only because the mock papers over
   it, so it isn't actually exercising the read path.

5. **`dotnet-service` is asymmetric with `express-service`.**
   No `--database` option, no agent integration, and its test only asserts mocks
   were called. Feels half-finished next to its sibling. (Best tackled alongside
   the `@nx/dotnet` rewrite, since that touches `dotnet-service` anyway.)

6. **`consultAgent` (agent.ts, 502 lines) is sophisticated but rough.**
   Hardcoded config (service URN, agent ID, 30s/120s timeouts — no env
   overrides), no retry on connection failure, and raw JSON-stringified error
   messages. Tests skip continuation mode, session-expiry, and timeout paths.

## 🟢 Low priority — hygiene

7. **No `engines` field or `.nvmrc`** anywhere, though CI pins Node 24 and
   `@types/node` is still on 22. Add `engines.node` + `.nvmrc` so local dev
   matches CI.

8. **Untracked artifacts not gitignored:**
   `packages/nx-adsp/abgov-nx-adsp-0.0.0.tgz` (an `npm pack` output) and
   `Interaction.md` (a consultAgent transcript). Add `*.tgz` to `.gitignore` and
   remove/ignore the scratch file.

9. **`react-form/react-forms.spec.ts`** — pluralized name breaks the
   one-spec-per-generator convention (test still runs; purely cosmetic).

10. **`react-task-list.ts:109`** uses `console.log` where the rest of the
    codebase uses `process.stdout.write`.

## Reclassified

- **semantic-release v24.2.7 pin (was 🔴 #1).** The nx-release README documents
  the channel-promotion regression and recommends pinning to `24.2.6`, while the
  package peer and the generated target both use `^24.0.0`. **Downgraded to
  non-issue:** the bug only affects **non-prerelease (`latest`) channel
  promotion** when multiple projects release on the same commit. All current
  consuming projects release via **alpha/beta** prerelease channels (which the
  regression provably does not affect), so no consumer is impacted today. Leave
  as-is; revisit only if a project starts promoting to `latest`.

## Suggested batching

- **A — `@nx/dotnet` rewrite** (top follow-up + #2 executor detection + #5
  dotnet-service): removes the `.npmrc` deferral and the 10 audit vulns.
- **B — nx-oc robustness** (#2 error handling, #3 e2e gaps, #4 test path).
- **C — ESLint 9 / flat-config** (#1) — schedule before the next Nx major.

---

# Product / feature roadmap

Everything above is correctness/maintenance. This section is the **product**
view: where nx-tools could go to be more valuable, not just more correct.

The tools cover a clear lifecycle — **scaffold** (nx-adsp generators) →
**AI-assisted capability wiring** (the consultAgent) → **release**
(nx-release/nuget) → **deploy to OpenShift** (nx-oc). Framework breadth is
already strong (React/Angular/Vue/Express/.NET + 6 fullstack combos), so the
opportunities are in **depth, day-2 lifecycle, and production-readiness**, not
more stacks.

> Caveats: the agent-service template catalog is server-side, so real
> ADSP-capability coverage may be broader than the client URNs suggest. These
> are inferred from the code, not from GoA team feedback — validate against real
> usage / support tickets / the platform roadmap before committing.

## P1 — Foundational

1. **"Keep generated apps current" path (biggest gap).**
   No package ships a `migrations.json`, and there's no `update`/`sync`
   generator. Generators are **one-shot stamps** — improvements to the golden
   path (hardened `nginx.conf`, security headers, SDK patterns, template CVE
   fixes) never reach already-generated consumer apps, so the fleet drifts the
   moment it's created. For a platform whose value is standardization, this is
   the core weakness.
   → Ship Nx migrations + an idempotent `nx g @abgov/nx-adsp:update` that
   re-applies the current golden path to an existing app with diff/preview.
   This turns nx-tools from a scaffolder into a *living* platform tool and is
   what makes a "golden path" claim true over time. Unlocks the most value.

## P2 — Make the golden path worth keeping current

2. **Deterministic capability catalog alongside the AI agent.**
   First-class ADSP integration today: configuration, event, form, push, tenant
   (+ agent). The consultAgent can pull more server-side templates but is
   conversational only — not repeatable, not CI-friendly, opaque about what's
   available. Common services (file, PDF, notification, calendar, comment,
   directory / value-metrics) lack a deterministic on-ramp.
   → Add `nx g @abgov/nx-adsp:add-capability <name>` for *known* needs; keep the
   AI for *discovery*. Repeatable + scriptable + CI-friendly.

3. **Production-readiness by default.**
   Deploy manifests recently gained liveness/readiness probes — good direction.
   Bake in more of what a gov service needs on day one:
   - **Observability** — OpenTelemetry tracing, structured logging, metrics/health
     endpoint (+ ADSP value/metrics-service wiring).
   - **Testing strategy** — generated apps with a real test harness and **mocked
     ADSP services**, so teams inherit a quality baseline.
   - **Security/compliance** — dependency/image scanning + SBOM in the pipeline,
     secret-management patterns (have `setup-secrets`), FOIP/privacy posture.
     A "compliance-ready by default" stance is high-leverage in government.

## P3 — DX / platform multipliers

4. **Local dev experience / ADSP emulation.**
   `express-service` already starts a dev-db via Podman. Next: a one-command
   local stack (app + db + **mocked** ADSP services) so devs can run and test
   without authenticating against real dev-tenant ADSP. High-ROI DX win; also
   unblocks #3's test harness.

5. **Environment promotion & PR preview environments.**
   nx-oc has pipeline + deploy + `sandbox` (hints at ephemeral envs) + `teardown`.
   Gaps: per-PR preview environments (ephemeral namespace, auto-torn-down) and
   dev→test→prod promotion/rollback workflows. Build once, every product team
   benefits.

6. **Agent as an ongoing advisor (not just scaffold-time).**
   The AI integration is a genuine differentiator but fires once during
   generation. Could become an "ADSP advisor" invokable against an existing app —
   suggest/add capabilities, review for ADSP best practices, or drive the #1
   update path conversationally. Pair with a deterministic preview/diff (also
   addresses the agent robustness concerns above).

**Sequence:** #1 is foundational and unlocks the most value; #2–#3 make the
golden path worth keeping current; #4–#6 are strong DX/platform multipliers.
