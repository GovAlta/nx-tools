# Split the generated pipeline workflow into a check workflow and a deploy workflow

The codemod half of this migration has already run. It rewrites
`.github/workflows/pipeline.yml` only when that file's head region byte-matches what
`@abgov/nx-oc:pipeline` emitted, so a workspace that customised its workflow is
reported rather than pattern-edited. Your job is the reported files, and nothing else.

**If `agentContext` is empty, stop — there is no work to do.** The codemod handled it.

## Why the split exists

One workflow carries one `concurrency` block, and the two halves need opposite policies:

- A superseded PR check run **should** be cancelled — `cancel-in-progress: true`.
- A deploy run **must not** be. It is a whole promotion chain that can sit for hours
  waiting on a GitHub Environment approval, and each deploy job brackets its rollout in
  `oc set triggers --auto` / `--manual`. A run killed inside that window leaves the
  Deployment on `--auto`, so it auto-rolls-out on any later ImageStream tag. Queuing
  costs a wait; cancelling loses an approval and can leave the namespace misconfigured.

Per-job `concurrency` does not solve this: each job would queue in its own group, so two
runs' promotion chains interleave rather than serializing as a unit.

## What to do for each file named in `agentContext`

1. **Read the file first.** It is customised — that is why it was skipped. Every edit
   below must preserve whatever it does beyond the generated shape (extra jobs, extra
   steps, changed runners, different `AFFECTED_BASE` handling, added secrets).

2. **Create `.github/workflows/pull-request.yml`** containing only the check half:
   - `name: Pull Request Check`
   - `on: pull_request` plus `workflow_dispatch`
   - `permissions: {}` at the top level, `contents: read` on the job
   - `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`
   - The `check` job's steps, moved verbatim — **keep the job name `check`** so an existing
     required status check on that name keeps resolving without touching branch protection.
   - Drop its `if: github.event_name == 'pull_request'` guard; the trigger now does that job.

3. **Narrow `.github/workflows/pipeline.yml`** to the deploy half:
   - Remove the `pull_request:` trigger, leaving `push:` and `workflow_dispatch:`.
   - Set `cancel-in-progress: false` and replace the old "cancel stale builds" comment with
     the reason above — a future reader must be able to tell this is deliberate.
   - Delete the `check` job.
   - Drop the now-redundant `if: github.event_name != 'pull_request'` from the `build` job.
   - Leave every `deploy*` / `e2e*` job, the `needs:` chain, and all interpolated values
     (registry, namespaces, environment names) exactly as they are.

4. **Do not move the security scanners into the deploy workflow.** Semgrep, TruffleHog,
   and hadolint are PR-gate concerns and travel with the `check` job.

5. **Do not add a sandbox or preview job.** Sandbox deployments are disposable and
   deliberately do not live in the delivery pipeline.

## Verify

`actionlint` if it is available, otherwise confirm by reading:

- Neither workflow triggers on both `push` and `pull_request`.
- `pull-request.yml` references no `secrets.OPENSHIFT_*` and no registry — it must not
  need credentials.
- `pipeline.yml` still has an unbroken `build → deployDev → deployTest → deployProd`
  `needs:` chain, with each environment's `environment:` block intact.
- The `check` job name is unchanged.
