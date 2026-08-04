---
title: implement non-structural frontmatter metadata in lineage graph registry and index entries
project-docs-ancestors: [features:include-non-structural-frontmatter-metadata-in-lineage-graph-registry-and-index-entries, service-descriptions:lineage-graph, requirements:lineage-registry-entry-carries-non-structural-frontmatter-metadata, requirements:lineage-index-entry-carries-optional-frontmatter-metadata-for-registered-artifact-descendants, requirements:requirement-generator-scaffolds-correct-shape-with-collision-free-id-assignment, domain-models:lineage-graph-metadata, bounded-contexts:lineage-graph, domain-terms:artifact-metadata]
resolves: []
---

## What this pass did

Full Discover → Design → Develop → Deploy pass for the lineage-frontmatter-metadata initiative.

**Discover**: Seeded the lineage-graph service description. Example-mapped three requirements to
closure: registry entries carry non-structural frontmatter metadata; index entries carry optional
metadata for registered artifact descendants; the requirement generator scaffolds the correct shape
with collision-free req-NNN id assignment.

**Design**: Bounded context (Lineage Graph), domain term (Artifact Metadata), domain model
(Lineage Graph Metadata). Key design decisions recorded in the model: `STRUCTURAL_FRONTMATTER_FIELDS`
is a closed set of exactly two (`project-docs-ancestors`, `resolves`); `extractFrontmatterMetadata`
parses the frontmatter block and filters structural fields, returning `{}` on any parse failure;
`RegistryEntry.metadata` is never undefined (always `{}`); `DescendantEntry.metadata` is optional
and present only when `type` is defined; the requirement generator scans the Tree directly for IDs
(no lineage.json dependency); sensitive metadata accepted without filtering (project-docs is
dev-workflow data, not business data).

**Develop**: Extended `RegistryEntry` and `DescendantEntry` in `project-docs-refs.ts`, added
`extractFrontmatterMetadata` helper, added `@abgov/nx-agent:requirement` generator with 14 unit
tests. 245 unit tests pass across 18 suites. An independent code review caught `nextRequirementId`
using string concatenation instead of `joinPathFragments` — fixed before commit.

**Deploy**: Release workflow (`.github/workflows/release-ci.yml`) confirmed present. Semantic-release
plugin chain loaded cleanly; dry-run aborted on SSH key unavailability (local environment), not a
CI concern. Commit type `feat(develop):` maps to a `minor` version bump on merge to `main`.

## Status

Deployment gate satisfied. The feature is ready to ship via PR to `main`; the actual publish is
CI-automated. No behavior re-run applies — this is an npm package, not an ADSP web app.
