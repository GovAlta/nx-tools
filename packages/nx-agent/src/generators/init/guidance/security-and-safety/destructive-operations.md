**Destructive operations.** `rm -rf`, `git checkout`/`restore`/`clean`, `git reset --hard`,
force-pushing, dropping a database table — none of these are caught by the pre-commit hook; the
damage happens before there's a commit to hook into. (On Claude Code, a `.claude/settings.json`
deny-list now hard-blocks shell patterns with no legitimate agent-initiated use case — `rm -rf`
rooted at `/`/`~`/`$HOME`, `sudo`, `mkfs`, `chmod -R 777 /`, `shutdown`/`reboot`/`halt`/`poweroff`,
history-rewriting or reflog-destroying git commands, and whole-namespace OpenShift/Kubernetes
deletion — regardless of permission mode; no equivalent exists for other tools yet, and it doesn't
reach `checkout`/`restore`/`clean`/`reset --hard`, which are too routine to blanket-deny.
Force-pushing can still be blocked by branch protection or a `pre-push` hook if configured; the
rest have no other check.)
Check what's actually at stake first — `git status` before anything that could discard uncommitted
changes, confirmed scope before a force-push or a DB-level drop — and prefer a reversible step
when one exists. Commit at a reasonable cadence rather than batching a session into one moment at
the end: a commit survives even a bad `reset --hard` via `git reflog`, but uncommitted changes
discarded by `checkout`/`restore`/`clean` have no such backup.
