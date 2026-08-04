---
name: Develop Skill Commitment Pattern
project-docs-ancestors: [bounded-contexts:agent-delivery-harness, domain-terms:implementation-plan, requirements:develop-skill-lineage-read-must-commit-before-write]
resolves: []
---

## Lineage Read Phase

The develop skill's step 1 instructs the agent to run `project-docs-lineage` and read the `index`
entry for the domain model being implemented. This produces a list of sibling files that share the
same domain-model ancestor.

**Invariant**: the lineage read is only meaningful if it shapes what is built. Reading sibling
resources without committing to what was found is structurally identical to not reading them. The
commitment is what makes the read actionable.

## Implementation Plan

The Implementation Plan (see domain term) is the artifact of the commitment. It is stated in-session
before the agent writes the first file. It is not a new project-docs artifact — it lives in context
and is passed to the independent reviewer.

**Invariant**: the plan must cover three axes before any code is written:
1. Which sibling resources will be reused (named explicitly, not just acknowledged)
2. What is being implemented fresh, and why no sibling covers it
3. Where domain invariants from the domain model belong (service layer vs. orchestration layer)

## Independent Review

The independent reviewer checks the code against the design artifacts. Adding the Implementation
Plan to the reviewer's context enables a checkable question: "Does the code match what the plan
said it would reuse and build fresh?" Without the plan, the reviewer can only compare code to design
— it cannot check whether a reuse decision was followed through.

**Invariant**: the Implementation Plan is passed to the reviewer alongside (not instead of) the
design artifacts and domain terms. It is never this pass's own reasoning — it is a prior commitment.
