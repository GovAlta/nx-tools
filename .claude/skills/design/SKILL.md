---
name: design
description: Turn a requirement into a bounded context, domain model, and (when there's a UI consumer) a UX design followed by an API design driven by what that UX actually needs — resolving any open Questions along the way, since domain modeling is exactly where they get answered. Vocabulary and domain-model artifacts use real @abgov/nx-agent generators; UX/API design are hand-authored, matching those same conventions, until a generator exists for them.
allowed-tools: Read, Write, Bash, Grep, Glob, Task
argument-hint: "<requirement slug to design against>"
---

`bounded-context`/`domain-term`/`domain-model` have real generators in `@abgov/nx-agent` — use
them, don't hand-author. `api-design`/`ux-design` don't have generators yet; hand-author those
under `project-docs/`, matching those generators' own conventions (frontmatter identity field plus
`project-docs-ancestors`, one file per instance).

## Scope: technical translation, not new business rules

Discover owns business-level Given/When/Then — example mapping already happened at refinement,
before a requirement reaches Design. Design's job is technical translation only: endpoint shapes,
status codes, auth. Every rule in an `api-design`/`ux-design` artifact must trace back to one
already in its requirement ancestor. If translating into technical shape surfaces a gap the
requirement doesn't cover, that's a missed rule in Discover — go add it there, don't invent new
scope here.

## Steps

1. **Read the requirement** (and its product-brief ancestor) this pass is designing
   against.

2. **Bounded context** — if this requirement's initiative doesn't have one yet:
   `npx nx g @abgov/nx-agent:bounded-context "<Name>"`. Fill in the generated placeholder: what's
   inside the boundary, and what's explicitly outside it — the product brief's own scope
   statements usually go straight into the "outside" half.

3. **Domain terms** — one per concept the requirement's Rules actually use precisely and
   repeatedly (not everything mentioned in passing). `npx nx g @abgov/nx-agent:domain-term "<Term>"
   --projectDocsAncestors=<path to the bounded context>`. Fill in the definition in the domain's
   own language.

4. **Domain model — check for siblings before assuming this is a founding pass.** Reading your own
   ancestors only tells you what *this* requirement derives from, not what else the same
   initiative already built. Run `npx nx g @abgov/nx-agent:project-docs-lineage` (without
   `--dry-run`, so it actually writes the file) and read `.nx-agent/lineage.json`'s `index` entry
   for the *shared* ancestor (the bounded context or service description) — the list of files
   that already reference it, each tagged with its own artifact `type`. (`getAncestors`/
   `getDescendants` are exported for other programmatic consumers to call in JS, not something an
   agent invokes as a command — the generated JSON file is the agent-readable form of the same
   graph.) If a domain model already exists, this is a revision, not a founding pass — read it in
   full and consider whether this requirement's rules interact with anything already modeled there.
   Then check `project-docs/open-questions/` for any artifact naming this requirement (or one of
   its rules) as an ancestor.

   Then:
   ```
   npx nx g @abgov/nx-agent:domain-model "<Name>" --projectDocsAncestors=<bounded context>
     --projectDocsAncestors=<each domain term> --projectDocsAncestors=<the requirement>
     --resolves=<each open-question this pass actually resolves>
   ```
   The requirement ancestor records *why* this model was founded; `--resolves` (a distinct
   `resolves` frontmatter field, also mirrored into `project-docs-ancestors`) is what makes a
   resolution structural — describe the aggregate and its invariants, resolving each named
   Question in the model's own text, with the `resolves:` reference as what a fresh reader (or
   `project-docs-lineage`'s `resolutionStatus` field) can check without reading that prose.

   If a Question needs real information nobody in this pass has, don't guess — stop and ask, or
   write an explicitly-marked placeholder decision if told to keep moving; a placeholder still
   counts as resolving it structurally ("answered for now, revisable"). Before treating a Question
   as unanswerable, check whether a connected MCP server could ground it (a platform server's
   tenant/role model, a design-system server's component inventory). A relevant server is often
   not provisioned yet this early — check whether the relevant plugin has its own `init` generator
   and run it now instead of waiting (same move as step 5).

   **If this pass finds the requirement (or an existing domain model) itself needs revision that
   Design can't just settle here** — run `nx g @abgov/nx-agent:blocker "<what's underspecified>"
   --projectDocsAncestors=<path>` rather than quietly designing around the gap, then get the
   upstream artifact fixed before continuing.

   **Verify the generated reference actually parses.** A long inline `project-docs-ancestors` or
   `resolves` array can get reformatted (by a formatter, or by hand) into a shape the reference
   parser doesn't recognize, silently dropping every reference with no error. After generating,
   check each field is either single-line (`project-docs-ancestors: [a, b, c]`) or block-style
   (`- a` / `- b` per line) — never a multi-line `[...]` block. Rewrite to block-style by hand if
   it got reformatted wrong, then re-run the gate below.

5. **Check for an existing capability before designing a new one.** Read the product brief's
   `known-platforms`. For each named platform, check whether it already covers what this
   requirement needs (a connected MCP server if one exists, or the platform's docs otherwise)
   before assuming a bespoke design is needed. **If no MCP server exists yet for a named platform,
   check whether that platform's own plugin ships an `init` generator (e.g. `@abgov/nx-adsp:init`
   for ADSP) and run it now**, rather than falling back to docs and moving on — these servers are
   typically provisioned lazily as a side effect of a later scaffolding generator, too late for a
   check this skill runs *before* deciding to build something bespoke. Running the plugin's `init`
   is safe to re-run and scoped to workspace-root setup only. It still needs a reconnect before
   this session can actually use it — say so explicitly, don't assume it's live just because the
   file exists. `known-platforms` being empty isn't the same as "nothing to check" — if this
   requirement plausibly needs something ecosystem-level Discover never named, flag it back rather
   than guessing.

6. **Design the requirement's interaction surface, if it has a human-facing consumer — authored
   before its interface points, not after.** An interaction surface is how a human actually
   experiences the requirement: what it shows, what it does, which rule each behavior traces to.
   For a UI-backed requirement, this is a **UX design** — hand-author under
   `project-docs/ux-designs/<slug>.md` (`<slug>` must contain only letters, digits, hyphens, and
   underscores — other characters are silently dropped by the lineage system), frontmatter
   `project-docs-ancestors:
   [domain-models:<slug>]`, and a structured shape with these sections:
   - **`navigation`** — where this feature lives in the app's information architecture: `sitemap-position`
     (its place relative to existing sections), `entry-from` (how users reach it from the app shell —
     `"temporary dev route"` is a valid explicit answer for a feature under initial development), and
     `route` (the URL path). This section is required; an absent or blank `entry-from` is a design gap,
     not a deferral — make the decision consciously and state it.
   - **`screens`** — each translating one of the requirement's business rules into what a screen shows
     and does, plus which design-system component(s) it uses (per step 5). Each screen also states what
     it needs from its provider as its own list.
   - **`rules`**, **`examples`**, **`questions`**

   The contract interface points get checked against next: the consumer states what it needs, the
   provider satisfies it. Register once: `"ux-designs": { "expectedAncestorTypes": ["domain-models"] }`.
   A requirement with no human-facing consumer (a backend-to-backend integration, a scheduled job) has
   no interaction surface to design — skip straight to interface points below.

7. **Design the requirement's interface points** — the named contracts other code calls into,
   each satisfying something a real consumer (the interaction surface above, or another service)
   actually stated it needs, each tracing to a specific rule. For an HTTP-backed requirement, this
   is an **API design** — hand-author under `project-docs/api-designs/<slug>.md` (same slug
   constraint: letters, digits, hyphens, underscores only), frontmatter
   `project-docs-ancestors: [domain-models:<slug>, ux-designs:<slug>]` when a ux-design exists for
   this requirement (`domain-models` alone otherwise). Each endpoint should satisfy something the
   ux-design's screens actually stated they need — don't let this become "design the interface
   first, make the consumer fit it." If step 5 found an existing platform capability, reference and
   configure it here instead of duplicating what it already does. Register once: `"api-designs": {
   "expectedAncestorTypes": ["domain-models"] }` — `ux-designs` stays an *additional*, per-case
   ancestor when one exists, never a blanket schema requirement.

   A requirement whose interface points aren't HTTP (a CLI's own option/output contract, a
   generator's file-writing side effects and error conditions, a message-queue consumer) needs the
   same two things an API design gives an HTTP-backed one — a contract per interface point, each
   tracing to a specific rule and satisfying a stated consumer need — authored as whatever concrete
   artifact type actually fits that shape, hand-authored the same way until it's proven and
   promoted, rather than forced into HTTP vocabulary that doesn't describe it.

## Gate — run before ending this skill

```
npx nx g @abgov/nx-agent:project-docs-lineage --dry-run --strict
```

- **Broken reference** always blocks — `--strict` is what makes it fail the command rather than
  just record the reference in the graph.
- **`unscoped`** (an artifact missing one of its kind's expected ancestors) blocks the
  Design→Develop transition — advisory while still mid-pass.

### Independent review — every pass

Give the reviewer only the requirement, domain model, domain-term files, and any UX/API designs
produced this pass — not this pass's own reasoning. Ask it:

1. Does the domain model use an established term inconsistently with its definition, or lean on a recurring concept in prose that should be its own domain term instead?
2. Does every rule in the requirement have a corresponding endpoint or screen in the UX/API design?
3. Is the API design consistent with existing API designs in the workspace (naming, status codes, auth patterns)?
4. Are auth and authorization requirements explicitly addressed, or silently assumed?
5. Does the API design actually satisfy what the UX design says its screens need?
6. Does the UX design's `navigation` section specify a concrete `entry-from` path, and is it consistent with the app's existing information architecture?

Always advisory — act on a real finding by fixing the inconsistency or missing coverage, don't
just log it.

### Commit before ending this skill

Commit exactly what this pass produced once the gate above passes —
`feat(design): <what was designed>`, covering the bounded context/domain terms/domain
model/UX-design/API-design this pass actually touched.
