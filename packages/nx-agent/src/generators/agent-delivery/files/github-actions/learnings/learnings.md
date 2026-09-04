# DDD flow — cross-iteration learnings

Not a project-docs artifact — no frontmatter, no lineage tracking, nothing here participates in
`status.resolution`/`unreferenced`/readiness signals. This file exists for exactly one gap those
mechanisms don't cover: something found once (a tool gotcha, an environment quirk, a skill-process
gap) that would recur for *any* future iteration regardless of which requirement it's working on,
so filing it in a requirement-scoped `iteration-retrospectives/*.md` entry means a differently-
scoped future session has no structural reason to ever read it.

**Bar for adding an entry**: would this recur for any future iteration, not just this one pass? If
it's specific to the requirement just worked on, it belongs in that iteration's own retrospective
instead. If it's something any DDDD session doing Discover/Design/Develop would hit regardless of
requirement, it belongs in the relevant `.claude/skills/<stage>/SKILL.md` instead (the actual
"read fresh every iteration" mechanism) — this file is for things that don't cleanly fit a specific
skill's own content, mostly CI/environment-specific facts about *this* runner.

Read this file fresh at the start of every iteration, the same as `AGENTS.md`. Append an entry
before ending a session if something found this pass clears the bar above — don't edit or remove
existing entries.
