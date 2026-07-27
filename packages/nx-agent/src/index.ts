// The querying half of the project-docs-ancestors convention — see
// packages/nx-agent/src/utils/project-docs-refs.ts. This is nx-agent's first
// public, importable API: everything else in the package is consumed only
// via `nx g @abgov/nx-agent:x`, but a reference lookup is meant for
// programmatic callers (an ESLint rule, an agent resolving context for a
// file it's about to touch) that need a stable contract, not the raw shape
// of .nx-agent/lineage.json — which stays an internal implementation detail,
// free to change as long as these signatures don't.
export {
  getAncestors,
  getDescendants,
  parseAncestorRef,
  refKey,
} from './utils/project-docs-refs';
export type { AncestorRef, DescendantEntry } from './utils/project-docs-refs';
