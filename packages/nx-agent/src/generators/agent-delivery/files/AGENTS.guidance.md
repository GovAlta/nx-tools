## DDDD workflow

This workspace uses the Discover/Design/Develop/Deploy (DDDD) workflow for tactical,
requirement-at-a-time delivery. Before picking up new work, check `project-docs/` state (run
`npx nx g @abgov/nx-agent:project-docs-lineage --dry-run` to see open questions, blockers, and
what's still undesigned/undeveloped/undeployed) rather than guessing what's next.

New work enters the loop through two generators, not by hand-authoring a file:

- `npx nx g @abgov/nx-agent:feature "<title>"` — a new capability request, for Discover to decompose.
- `npx nx g @abgov/nx-agent:bug "<what's wrong>"` — something already built misbehaving, for Develop
  to investigate and fix directly (no new Design pass unless investigation finds the spec itself
  was wrong).

- `.claude/skills/discover/SKILL.md` — decompose a `feature` artifact into requirements with IDs
  seeded at birth, or example-map one requirement to closure.
- `.claude/skills/design/SKILL.md` — turn a requirement into a domain model and (when there's a
  consumer) a UX/API design.
- `.claude/skills/develop/SKILL.md` — implement a design, or fix a `bug`, with an inline gate
  battery.
- `.claude/skills/deploy/SKILL.md` — provision this project's own deploy target and re-run the
  design's behavior specs against the live result.

Read the relevant skill file fresh each time — don't recall its content from memory, it may have
been edited since. Each skill names its own gate and commit convention; follow them rather than
inventing new ones.
