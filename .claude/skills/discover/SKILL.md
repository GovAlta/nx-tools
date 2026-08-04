---
name: discover
description: Frame a feature request into a service description and requirements with IDs seeded at birth. Two modes — intake (decompose a features:<slug> artifact) and refinement (example-map one requirement to closure) — same skill, branches on what it's given.
allowed-tools: Read, Write, Bash, Grep, Glob, Task
argument-hint: "<feature slug to decompose, or a requirement slug to refine>"
---

`feature`/`open-question`/`blocker` have real generators (`nx g @abgov/nx-agent:feature`/
`:open-question`/`:blocker`) — use them, don't hand-author. `service-description`/`requirement`
still don't have one; write them by hand in the shape below, matching `domain-term`/
`bounded-context`'s own conventions. All four live under `project-docs/`.

`bug` also has a real generator (`nx g @abgov/nx-agent:bug`), but this skill never processes one
directly — an open bug routes straight to Develop (investigate against the existing spec, fix,
verify), not through Discover's intake/refinement modes below.

## Which mode

- A `features:<slug>` artifact with no `requirements`/`service-descriptions` descendant yet
  (the raw capability request hasn't been decomposed): **intake**.
- A single, already-scoped requirement (or a slug naming one that exists): **refinement**.
- On a brand-new initiative, the first invocation does *intake*; if it yields exactly one clean
  requirement, continue directly into *refinement* for it in the same pass.

## Intake

1. Read the feature artifact's own body in full before writing anything — this is the raw
   capability request, written the way it was actually asked for, not pre-structured.
2. Identify every distinguishable concern — a candidate requirement, a stray decision that isn't
   a requirement yet, or something genuinely unclear.
3. **If no `project-docs/service-descriptions/<slug>.md` exists yet for this initiative, write it
   first, before any requirement.** Root artifact, ancestor is the feature that founded it:

   ```yaml
   ---
   service: <Name>
   audience: []
   known-platforms: []
   questions: []
   project-docs-ancestors: [features:<feature-slug>]
   ---

   <!-- Problem/opportunity framing and product positioning: what this service is for and who
        it's for, in plain language. -->
   ```

   Register once: `"service-descriptions": { "expectedAncestorTypes": ["features"] }` in
   `project-docs/artifact-schema.json` — every service-description should trace back to at least
   one feature that founded it. **Get this exact line right**: this registration lives only as this
   prose, nowhere in code, so the ancestor convention above and this schema entry have to change
   together or `project-docs-lineage`'s `unscoped` check never actually fires for a
   service-description missing a feature ancestor.

   `known-platforms` names existing systems/platforms/ecosystems this needs to operate within or
   integrate with (e.g. `adsp`) — facts about the operating context, not a design decision (that's
   Design's job). If genuinely unknown either way, add a `questions` entry rather than assuming.

   A later pass extending the same initiative from a *different* feature appends that feature to
   `project-docs-ancestors` too (never overwrite the list) — the same convention every other
   artifact type already uses for "built from more than one source," not a bespoke field.

4. For each concern that's a genuine, scoped candidate requirement, write it under
   `project-docs/requirements/<slug>.md` (slug from a short descriptive title):

   ```yaml
   ---
   title: <short descriptive title>
   id: req-<NNN>
   project-docs-ancestors: [service-descriptions:<service-slug>, features:<feature-slug>]
   rules: []
   questions: []
   ---
   ```

   The `features:<feature-slug>` ancestor is provenance — which feature request this requirement
   was actually decomposed from — additional to, not instead of, the service-description ancestor;
   `requirements`'s own `expectedAncestorTypes` (below) still only requires the latter.

   Rules/examples/questions live in frontmatter as structured YAML, not markdown body bullets.
   Leave `rules: []` empty here — intake seeds the requirement; refinement (below) example-maps it.

   `id` is a human-facing sequential label only — the graph key is the file's slug. Pick the next
   unused `req-NNN` by checking existing files under `project-docs/requirements/`.

   Top-level `questions` is for anything that doesn't attach to one rule (e.g. "who is authorized
   to review a submission" — a property of the whole requirement). Each rule has its own
   `examples`/`questions` for points specific to that rule.

   Register once (on the first requirement written): `"requirements": { "expectedAncestorTypes":
   ["service-descriptions"] }` in `project-docs/artifact-schema.json`.

5. For anything from step 2 that *isn't* a clean requirement yet — a decision nobody's made, a
   dependency outside this work — don't drop it and don't force it into a requirement seed
   prematurely. Run `nx g @abgov/nx-agent:open-question "<what's undecided>"
   --projectDocsAncestors=<path>` and say so in your summary of this pass.

## Open questions and blockers

Two artifact types, both resolved by reference, never by editing something in place. Defined once
here since Discover is the earliest stage that can raise either; Design/Develop/Deploy reuse the
same mechanism.

- **`nx g @abgov/nx-agent:open-question "<what's undecided>" --projectDocsAncestors=<path>`** —
  something genuinely undecided: an external approval, a business-policy call, a platform
  capability nobody's checked. `--projectDocsAncestors` names whatever raised it — a service
  description, a requirement, or a specific rule (`requirements:<slug>#rule-<n>`).

- **`nx g @abgov/nx-agent:blocker "<what needs fixing and why>" --projectDocsAncestors=<path>`** —
  a later stage finds an *existing* artifact needs revision. `--projectDocsAncestors` names the
  artifact that needs fixing. Don't patch around the problem locally — run this, then fix the
  named artifact for real.

**Both resolved via a `resolves:` frontmatter field** on whatever artifact answers or fixes them —
written by a generator's own `--resolves <path>` flag (`feature`/`domain-term`/`bounded-context`/
`domain-model`) or by hand for a type with no generator yet (`api-design`, `ux-design`). Never a
separate edit on the open-question/blocker file itself, and an unrelated later edit to the target
doesn't count as resolving anything. `project-docs-lineage` reports resolution status directly
(`violations.resolutionStatus.open`/`.resolved`) — nothing to compute or register by hand.

**`bug` also tracks open/resolved status this same generic way, but is resolved differently** — see
`develop/SKILL.md`'s own bug-handling section; Discover never resolves one directly.

A `questions:` entry (top-level or per-rule) still unresolved at this skill's own Gate promotes
into a dedicated `open-questions:` artifact (ancestors pointing at the specific rule it came
from); the inline entry then clears to `[]`. A Question still being worked mid-refinement stays
inline — promotion only happens at the stage boundary.

Surface a plain-language notice the moment a second `blockers:`/`bugs:` artifact stacks up against
the same target, so a repeat hit is seen immediately.

## Refinement

Given one requirement (by slug or `id`):

1. Read the requirement file and its service-description ancestor.
2. Example-map it: add an entry to frontmatter `rules:` for each distinct behavior the
   requirement implies, each with either a Given/When/Then-shaped string in `examples:` or a
   question string in `questions:` — never leave a rule with both empty.
3. Don't invent scope the raw input didn't support. If a rule can't be made concrete without
   guessing, it's a question, not an example.

## Gate — run before ending this skill

```
npx nx g @abgov/nx-agent:project-docs-lineage --dry-run
node scripts/check-example-mapping.mjs
```

These check different things:

- `project-docs-lineage`'s broken-reference check always blocks, regardless of mode. Its
  `orphans` report is a graph fact (has Design picked this requirement up yet), not an
  example-mapping check — it stays true even after perfect example-mapping, since nothing
  downstream exists yet.
- `check-example-mapping.mjs` is the actual example-mapping gate: every `rules:` entry needs a
  non-empty `examples` or `questions`, and every example must actually be Given/When/Then-shaped.
  Advisory mid-refinement; don't hand off to Design with a failing rule.

### Independent review

Run every time a requirement finishes refinement, not just founding ones. Give the reviewer only
the finished requirement and its service-description ancestor — not this pass's notes, reasoning,
or raw input. Ask it:

1. Does the service description imply a rule this requirement doesn't cover?
2. Is any example Given/When/Then-shaped but testing the wrong behavior — or vague enough that "pass" and "fail" would be indistinguishable in a real test run?
3. Does the requirement bundle two distinct behaviors that should be separate requirements?
4. Are there security, privacy, or authorization implications not surfaced as rules or open questions?

Always advisory — report its findings alongside the gate checks, plain language, before ending
the skill.

### Commit before ending this skill

Commit exactly the files this pass wrote or changed, nothing else in flight:

- **Intake's output is a seed, not a finished decision** — rules stay empty until refinement runs:
  `chore(discover): seed <N> requirement(s) from intake for <initiative>`.
- **Refinement's output is a completed decision** once it passes the gate above:
  `feat(discover): example-map <requirement> to closure`.

Don't bundle an intake pass and a refinement pass into one commit even when they happen back to
back in the same invocation.
