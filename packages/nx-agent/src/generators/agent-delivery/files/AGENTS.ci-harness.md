## CI harness

`.github/workflows/agent-delivery-iteration.yml` drives the DDDD loop automatically. On each
push to a `feature/**` or `fix/**` branch it identifies the highest-priority signal, runs a
Copilot CLI agent session to advance it, then self-dispatches the next iteration until nothing
is left or the `MAX_ITERATIONS` cap is hit.

### Branch conventions

| Branch prefix | Signal types eligible | Typical use |
|---|---|---|
| `feature/**` | All (discover → design → develop → deploy) | Advancing a new capability from a `features:` artifact through to Deploy |
| `fix/**` | Resolution only (`broken:` and `open:`) | Resolving a specific blocker, open question, or broken reference |

Both branch types derive artifact scope from the first commit (see below). The `fix/**`
restriction is enforced independently of scope — a scoped fix branch only sees resolution
signals within its scoped artifacts; a `feature/**` branch sees all signal types within scope.

### Artifact scope

Controls which artifacts' signals are eligible each iteration. Set via the `artifact_scope`
input on the GitHub Actions manual dispatch UI, or left blank to auto-derive on first push.

| Value | Behaviour |
|---|---|
| Blank | Scope derived from the project-docs files the branch's first commit touched. Forwarded unchanged to all subsequent iterations — the first commit's scope is stable for the life of the branch. |
| `project-docs/features/my-feature.md` (or a comma-separated list of paths) | Explicit scope: only signals whose artifact is, or descends from, the named artifact(s). Use this on a manual trigger when you want to re-run the loop focused on a specific artifact without relying on the first commit having touched it. |
| `*` | Open scope. No artifact filtering: the agent picks the globally highest-priority signal. Use for a broad sweep of the whole backlog. |

When task-identification finds no eligible signals after filtering it emits a diagnostic naming
which filter(s) fired and how many signals each matched, so a human or agent debugging a stalled
loop can tell whether the branch type, artifact scope, or their combination is the constraint.
