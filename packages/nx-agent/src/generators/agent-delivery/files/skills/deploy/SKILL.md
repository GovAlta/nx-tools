---
name: deploy
description: Provision this project's own deploy target if it doesn't exist yet, run it, then re-execute the design's behavior specs against the live result where that's meaningful — never author new specs here, only run what Design/Develop already wrote. For an ADSP web app that's @abgov/nx-oc's sandbox target; a different kind of deployable has its own equivalent. Deployment success blocks; the behavior re-run is advisory.
allowed-tools: Read, Write, Bash, Grep, Glob
argument-hint: "<project to deploy>"
---

Frontend and backend deploy as independent targets, not one atomic bundle. A requirement whose
backend track is ready to deploy doesn't wait on its frontend track, and vice versa.

## Steps

1. **Provision this project's own deploy target once — never re-run the generator below on a later
   pass.** For an ADSP web app, check whether `.openshift/<project>/<project>.sandbox.yml` already
   exists; only if it doesn't, generate one:
   `npx nx g @abgov/nx-oc:sandbox <project> --sandboxProject <namespace> --env <env> --tenant
   <tenant>`. This is provisioning, distinct from step 3's actual deploy below — don't conflate the
   two just because both happen to be named `sandbox`. A different kind of deployable (an npm package, say) usually has something much
   lighter here — confirming a publish workflow already exists — rather than a provisioning
   generator at all. **Pass `--env`/`--tenant` explicitly, matching the tenant actually in use** — this
   generator's own default falls back to whatever the target app was scaffolded against, then to
   `test`, silently targeting the wrong ADSP environment/tenant if that default doesn't match.
   Needs `--registry` explicitly too if the workspace has no git remote to derive one from.
   Requires ADSP sign-in:
   - **Interactive session**: `npx @abgov/adsp-cli login --env <env> --tenant <tenant> --scope
     adsp-cli-admin` — a browser flow, the user does this themselves.
   - **Headless/CI runner with no browser available**: `@abgov/adsp-cli` (1.7+) has a
     non-interactive client-credentials login — set `ADSP_CLIENT_ID`/`ADSP_CLIENT_SECRET` and
     `ADSP_TENANT_REALM` as environment variables, and `nx-oc`'s own token resolution
     (`ensureAdspToken`) picks them up automatically once `process.env.CI` is set (most CI
     runners, including GitHub Actions, already set it). **`ADSP_TENANT_REALM` needs to be the
     tenant's actual Keycloak realm, not just its display name** — this fetch resolves its realm
     independently of whatever `--tenant` was passed to the generator above, so the two need to
     agree on the same tenant. The target tenant's `adsp-cli-ci` confidential Keycloak client is
     bootstrapped **disabled** at tenant creation — a tenant admin has to enable it and generate
     its secret before this path works; say so explicitly if that hasn't been done.

2. **Check this project's own `AGENTS.md` for its deploy target name and runbook pointer, then
   read that runbook before deploying** — the real, versioned instructions, never recalled from
   memory. For an ADSP web app, `AGENTS.md`'s own "Sandbox deployment" section states the target
   explicitly (`sandbox`) and points at the generated `.openshift/<project>/SANDBOX.md`. A
   different kind of deployable has its own equivalent — wherever that project's own convention
   for "how do I actually ship this" lives; if none exists yet and this project genuinely needs
   deploying, write it once rather than leave the gap.

3. **Deploy, by running that target — every pass that reaches Deploy, unconditionally, with no
   skip condition of its own.** Unlike step 1's one-time provisioning, this always runs: a
   provisioned deploy target with nothing new to ship is not a real scenario this skill needs to
   guard against — reaching Deploy at all means Develop just produced something to ship. For
   sandbox, that's `npx nx run <project>:sandbox` — the same uniform `nx run <project>:<target>`
   invocation Develop's own Gate already relies on for `test`/`build`/`lint`, just a different
   target name. Can take several minutes (build, push, import, rollout) — expect it to move to the
   background rather than blocking the session.

4. **A failed rollout-status wait doesn't necessarily mean the deploy failed.** A first-time
   deploy can end up with a redundant second rollout racing the first one's database migration —
   one pod healthy, a second stuck `Init:CrashLoopBackOff` on a migration "already exists" error.
   `oc rollout status` then times out even though the service is actually up. Check `oc get pods
   -n <namespace> -l name=<project>` and `curl` the route's `/health` before assuming the deploy
   is broken. If it's this pattern: `oc scale deployment/<project> --replicas=0`, wait for pods to
   clear, `--replicas=1` for one clean single-pod rollout.

5. **A shared sandbox Postgres instance can carry stale state from unrelated prior exploration.**
   If a table/migration record predates this deploy by more than a few minutes (check `created_at`
   in `drizzle.__drizzle_migrations`), it's stale data, not this deploy's bug. Drop it and redeploy
   clean.

## Sandbox is the default; graduating to a real pipeline is a separate, deliberate step

Sandbox (Steps 1–5 above) is the right default for tactical iteration.

**Whether to graduate a service to `@abgov/nx-oc`'s real multi-environment pipeline is a
service-level decision, not a per-requirement one** — don't infer it from iteration count; it's a
judgment call for whoever's driving the work.

Sandbox and deployment coexist: `@abgov/nx-oc:deployment <project>` writes its own
`.openshift/<project>/<project>.yml` (image source, DB secret names, an ImageStream trigger
sandbox doesn't have), separate from `sandbox`'s own `<project>.sandbox.yml`. Both render from the
same shared template but land in different files and don't collide — every rendered object also
carries a `deployment-mode: pipeline`/`sandbox` label, and each mode's teardown target scopes its
delete to match. The `Dockerfile` output stays fully shared either way. A project can run both a
real CI pipeline and a sandbox side by side; graduating doesn't retire the sandbox targets.

1. **Run `@abgov/nx-oc:pipeline` once, workspace-wide** (skip if `.openshift/environments.yml`
   already exists): sets up the environment manifest and the GitHub Actions pipeline workflow.
2. **Run `npx nx g @abgov/nx-oc:deployment <project>`** to join it. From here, deploys to this
   project go through the pipeline's own CI, not `nx run <project>:sandbox`. This is also the
   signal Develop's own Gate checks (via `.openshift/<project>/<project>.yml`'s existence) to decide
   whether its own `<service>-e2e` run can become advisory instead of blocking — once this project
   is here, the pipeline's own CI is what actually gates e2e before anything merges.
3. **The Gate below still applies the same way**, but the live route now needs resolving per
   environment (`oc get route <project> -n <env-specific namespace>`), not the single
   `sandboxProject` namespace.
4. **A Jest/axios-based backend e2e project has no equivalent in the real pipeline's own e2e job
   today** — it's hardcoded to Playwright (`for app in $AFFECTED_APPS`, checking for a
   `playwright.config.*` and skipping anything without one). Say this explicitly at graduation
   time for a Jest-based service.

## Gate — two tiers, not one

**Deployment success blocks — some mechanically-checkable fact that the new version is actually
live and healthy, whatever that means for this kind of deployable.** For an ADSP web app, that's
pods `Ready` and the route's own `/health` answering; a redundant-rollout false failure (step 4
above) doesn't count against it once confirmed as that pattern.

**The behavior re-run is advisory, not a second blocking gate — re-running the design's own spec
against the live result, when doing so is meaningful for this kind of deployable.** For an ADSP
web app, resolve the live route rather than asking anyone to type it. There is no separate `smoke`
target — reuse the exact same `e2e` target Develop's own gate already runs:

```
host=$(oc get route <project> -n <namespace> -o jsonpath='{.spec.host}')
BASE_URL="https://$host" npx nx e2e <service>-e2e --exclude-task-dependencies
```

`--exclude-task-dependencies` skips the `dependsOn: [build, serve]` edge the generator wired into
the `e2e` target. That alone isn't enough, though: `global-setup.ts`/`global-teardown.ts` also
wait for and kill a *local* port unconditionally. **If they don't already guard on `BASE_URL`, add
that guard before running this** — skip `waitForPortOpen`/`killPort` when `process.env.BASE_URL`
is already set, mirroring what the frontend generators already do for their own Playwright
`webServer` config. A one-time fix per project. Once guarded, the same `e2e` target and spec file
run against local build+serve in Develop and against a live deployment here.

A failure here doesn't block the deploy from standing — `oc rollout status` is the hard gate, this
is report-only, the same split `@abgov/nx-oc`'s own pipeline draws. Report every failure and every
skipped case plainly regardless.

If a live-only failure traces back to a real gap in the design itself (not shared infra, not a
missing credential), run `nx g @abgov/nx-agent:blocker "<what's wrong>"
--projectDocsAncestors=<path>` naming it rather than working around it at the deploy step.

### Iteration close-out — write this once the gate above concludes, whether it passed cleanly or is blocked

Run `nx g @abgov/nx-agent:iteration-retrospective "<title>" --projectDocsAncestors <path>
[<path> ...] [--resolves <path> ...]` (`@abgov/nx-agent` 1.14+), naming every requirement, domain
model, or design this pass's initiative substantively covered — the whole set Discover→Deploy
worked through this round, not just the one project just deployed. `--resolves` for anything this
pass genuinely resolved. Captures two things nothing else durably records:

- **What was actually found and fixed along the way** — a real design gap discovered and
  corrected, a blocker raised and resolved, an independent review catching something real. The
  reference graph shows the final state of every artifact, not the journey that got there.
- **An explicit status, when "deployment succeeded" and "verified working end-to-end" diverge.**
  The gate above is necessary, not sufficient — if the behavior re-run (or manual testing) found a
  real capability still doesn't work end to end, say so here explicitly rather than let a clean
  deployment gate imply more than it verified.

One file, written once this iteration's own work concludes, not a new checkpoint with its own
gate — the generator self-registers the type (`expectedAncestorTypes: []`, `terminal: true`) so
this type's own correctly-having-zero-descendants doesn't get reported as an orphan alongside a
genuine dead-end.

### Commit, when this pass actually generates something

Deploying itself usually produces nothing new to commit. But the first time
`@abgov/nx-oc:sandbox`/`:deployment`/`:pipeline` runs for a project, it writes real, versioned
config (`SANDBOX.md`, the manifest, the pipeline workflow) — `chore(deploy): generate
sandbox/pipeline config for <project>`. A routine redeploy of already-generated config has
nothing new to commit.
