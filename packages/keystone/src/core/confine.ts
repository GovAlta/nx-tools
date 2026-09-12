// project-docs-ancestors: cli-designs:keystone-init

import { isAbsolute, relative, resolve, sep } from 'path';

export type Confinement =
  | { readonly permitted: true; readonly absolute: string }
  | {
      readonly permitted: false;
      readonly reason: 'absolute' | 'escapes' | 'is-target';
    };

/**
 * Whether an ABSOLUTE path lies inside a root.
 *
 * The one place this decision is made. Both questions that need it — a declared relative path, and
 * the destination a symlink resolves to — reduce to this, so neither caller re-implements it. An
 * adapter that had to compare paths itself once did, with its own hardcoded separator, which is how
 * a decision like this quietly becomes two.
 *
 * Callers that have resolved real paths (via realpath) should pass those: this function is lexical
 * by nature and cannot see through a link on its own.
 */
export function contains(root: string, absoluteCandidate: string): boolean {
  const rel = relative(root, absoluteCandidate);
  return (
    rel !== '' &&
    !rel.startsWith(`..${sep}`) &&
    rel !== '..' &&
    !isAbsolute(rel)
  );
}

/**
 * Whether one declared, target-relative path may be written.
 *
 * Pure, and lexical: it answers for the path as declared. It cannot see a symlink — neither one in
 * the source nor one already in the target — so the adapter that does that I/O resolves the real
 * paths and asks `contains` about the result. Saying so here matters because an earlier version of
 * this comment claimed to cover the symlink case and did not.
 *
 * It matters at all because the declaration is content from a resolved source, so the paths this
 * installer writes are not entirely of its own choosing.
 */
export function confine(targetRoot: string, candidate: string): Confinement {
  if (isAbsolute(candidate)) {
    return { permitted: false, reason: 'absolute' };
  }

  const root = resolve(targetRoot);
  const absolute = resolve(root, candidate);

  if (absolute === root) {
    return { permitted: false, reason: 'is-target' };
  }
  if (!contains(root, absolute)) {
    return { permitted: false, reason: 'escapes' };
  }

  return { permitted: true, absolute };
}
