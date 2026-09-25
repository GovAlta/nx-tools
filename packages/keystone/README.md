# @abgov/keystone

Places the Keystone harness into a project for the first time.

The harness is distributed by copy and implements re-copy into a project that already has it,
deliberately refusing a fresh directory. Nothing placed it into a new project, so every machine
that bootstrapped one grew its own install script — copying from whatever a working clone happened
to contain rather than from a declared artifact set, which is the single cause of most of their
defects. This package is that step, versioned.

```
npx @abgov/keystone init [--ref <tag|branch|sha>] [--target <dir>] [--plan] [--json]
npx @abgov/keystone init --source <path to a harness clone> [--target <dir>] [--plan] [--json]
```

Without `--source`, the installer fetches from the constant upstream repository. `--ref` pins
the fetch to a specific tag, branch, or commit SHA — useful for testing a pre-release, pinning
to a known-good tag before promoting, or reproducing an issue against a specific commit. When
`--ref` is omitted the upstream's default branch is used. `--ref` and `--source` are mutually
exclusive.

`--plan` reports what would be written and writes nothing. `--json` emits a machine-readable
payload for both outcomes — including refusals, because for an agent consumer the refusal payload
_is_ the API.

## What it reads, and what it does not decide

The set of files that travel is **the source's own answer**. This package reads the source's
declaration and applies the source's own predicate at run time; it carries no file list and no
opinion about the contents. A copy of somebody else's rules is exactly what went stale in the
hand-written installers.

The universe is the source's **git index**, intersected with that predicate. That is what excludes
an installed dependency cache, a generated file, and anything else the source ignores, with no
ignore list here — and it is a leak control as much as a determinism one, since ignored files in a
working clone are where credentials sit.

## What it will not do

- Overwrite a file it did not place. A target may have files of its own; a refusal is keyed on a
  collision at a declared path, and it names that path.
- Write outside the target, including through a declared path that is absolute or traverses upward,
  a symbolic link the source declares, or a symlinked directory already in the target.
- Place a mode wider than it needs: any execute bit becomes `0o755`, none becomes `0o644`, and
  setuid, setgid and group or other write bits never travel.
- Run any harness command. Those resolve against the new project's own configuration and hooks,
  which bind only to a session rooted in the project — so bootstrap ends at a handoff and the
  project's own setup runs in a fresh session.

A refusal always means the target was not written to. That is precondition checking rather than
atomicity: an I/O failure part-way through a write leaves the files written so far.

## Trust

The source repository is a constant this package carries, with no option to redirect the fetch.
That is deliberate: because the fetch cannot be pointed elsewhere, access to that one repository is
the trust boundary — the same boundary that already governs obtaining the harness by any other
means. This package reads the source's declaration and, for an update, runs the source's own tool,
so a caller-supplied repository would move that boundary to whatever the caller named.

A local `--source` path carries the caller's own authority and no more. The identity check on it is
a wrong-path guard: the declaration is part of the tree being judged, so it cannot catch a hostile
one.

## Credentials

The installer fetches over HTTPS. If the GitHub CLI (`gh`) is present and authenticated, it runs
`gh auth setup-git` before the fetch so that git uses the same credentials — this is the step most
commonly missing in managed environments like Dev Spaces or Codespaces where `gh` is
pre-authenticated but git's credential helper is not yet wired. If no account is authenticated and
stdin is a terminal, it launches `gh auth login` interactively first.

Both steps are non-fatal: if they cannot be applied the fetch proceeds as-is, and a failure names
the access required rather than surfacing a raw transport error.
