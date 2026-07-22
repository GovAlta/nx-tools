**Destructive operations.** `rm -rf`, `git checkout`/`restore`/`clean`, `git reset --hard`,
force-pushing, dropping a database table — none of these are caught by the pre-commit hook; the
damage happens before there's a commit to hook into. (Force-pushing can still be blocked by
branch protection or a `pre-push` hook if configured; the rest have no git-level check at all.)
Check what's actually at stake first — `git status` before anything that could discard uncommitted
changes, confirmed scope before a force-push or a DB-level drop — and prefer a reversible step
when one exists. Commit at a reasonable cadence rather than batching a session into one moment at
the end: a commit survives even a bad `reset --hard` via `git reflog`, but uncommitted changes
discarded by `checkout`/`restore`/`clean` have no such backup.
