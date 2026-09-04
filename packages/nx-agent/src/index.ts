// The querying half of the project-docs-ancestors convention — see
// packages/nx-agent/src/utils/project-docs-refs.ts. This is nx-agent's first
// public, importable API: everything else in the package is consumed only
// via `nx g @abgov/nx-agent:x`, but a reference lookup is meant for JS
// callers that need a stable contract — an ESLint rule, or a build step
// resolving context for a file it's about to touch. Not an agent: the
// generated design/develop/discover skills all tell it to run
// project-docs-lineage and read the file instead. That file's own consumed
// shape is declared and versioned in the README (schemaVersion); everything
// outside that declaration stays free to change, as do these signatures.
export {
  getAncestors,
  getDescendants,
  parseAncestorRef,
  refKey,
} from './utils/project-docs-refs';
export type { AncestorRef, DescendantEntry } from './utils/project-docs-refs';
