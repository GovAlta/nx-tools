# audit-emitted-deps

Two checks over the dependency ranges the `@abgov/*` generators write into a
consuming workspace.

Those ranges are string literals in generator bodies — `react-app.ts`,
`express-service.ts`, `init.ts` and the rest. None of the packages appear in any
`package.json` in this repo, so:

- this repo's own `npm audit` never sees them;
- Dependabot and Renovate never see them either, since both read manifests and
  lockfiles.

Every bump before these checks existed was reactive and human-noticed.

## `npm run audit:emitted-deps`

Extracts every range from the actual `addDependenciesToPackageJson` call sites
(TypeScript AST, so a new generator is picked up without editing a list),
resolves them into a throwaway lockfile, and runs `npm audit` against that.

Findings are reported with the chain from one of our pins down to the vulnerable
package, because the package name alone is rarely enough to act on — most
findings sit several levels deep. Anything at or above `high` (override with
`AUDIT_LEVEL`) that isn't in `allowlist.json` exits non-zero.

Runs weekly from `.github/workflows/emitted-deps-audit.yml`, which opens a
rolling issue rather than failing a contributor's PR — a new advisory is nobody's
PR to fix.

`src/migrations/**` is excluded. A released migration must keep applying the same
change forever, so its version literals are frozen by design; auditing them would
report drift that must not be fixed.

### allowlist.json

Keyed by GHSA id, one entry per accepted advisory, each with a `reason` and a
`reviewed` date. Deliberately not scoped by package — a blanket "ignore anything
via X" entry would silently swallow the next advisory against X too.

The script also reports allowlist entries that no longer match a finding, so
they get deleted rather than accumulating.

## `npm run audit:nx-alignment`

The frontend generators each call an `@nx/*` application generator and then call
`addDependenciesToPackageJson` themselves, without `keepExistingVersions` — so on
any key both write, ours silently wins. This check fails when our range admits
something below the floor Nx chose. `vue-router` sat at `^4.0.0` against Nx's
`^4.5.0` that way.

It runs the real `@nx/*` generators rather than reading their `versions.js`,
because an export existing there doesn't mean the generator writes it —
`@nx/angular` defaults `zoneless` to true on Angular >= 21 and writes no
`zone.js` entry at all, so a name-matching comparison invents overrides that
don't exist.

Local and deterministic, so it runs on every PR.

Adding a delegated `@nx/*` generator without a matching `DELEGATIONS` entry
fails the check, so a new one can't slip through uncompared.

## What these checks do not cover

Most of a generated app's dependencies come from the delegated `@nx/*`
generators, pinned inside the installed `@nx/*` package. Those move with the
consumer's Nx version, not with anything here — `nx migrate` is what keeps that
layer current. The alignment check covers only where the two layers overlap.
