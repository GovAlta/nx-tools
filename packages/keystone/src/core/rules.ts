// project-docs-ancestors: cli-designs:keystone-init

import { Refusal } from './refusal';

// The small decisions, in one place. Each was its own file, which answered "one concept per file"
// and made the package look far larger than it is: five files averaging thirteen lines. They are
// all the same kind of thing — a pure function over gathered facts, with no I/O — so they read
// better together than as five imports.

// ---------------------------------------------------------------- the declared set

/**
 * The source's tracked files, intersected with the source's own travel predicate.
 *
 * The predicate is a PARAMETER rather than logic implemented here, and that is the point: the set
 * is the source's answer, not this installer's. A copy of the source's rules living here is exactly
 * what went stale in the hand-written installers this package replaces.
 *
 * Using the source's GIT INDEX as the universe excludes an installed dependency cache, a generated
 * file, and anything else the source ignores, with no ignore list of our own — a leak control as
 * much as a determinism one, since ignored files in a working clone are where credentials sit.
 *
 * No path rewriting: `git ls-files` emits forward slashes on every platform, and normalising would
 * silently rename a tracked file whose name genuinely contains a backslash.
 */
export function declaredSet(
  trackedPaths: readonly string[],
  travels: (relPath: string) => boolean,
): string[] {
  return trackedPaths.filter((p) => travels(p)).sort();
}

// ---------------------------------------------------------------- placed file mode

export const MODE_EXECUTABLE = 0o755;
export const MODE_REGULAR = 0o644;
const ANY_EXECUTE = 0o111;

/**
 * The mode a placed file carries, given its source file's.
 *
 * Whether it is executable travels, and nothing else does. Placement installs an executable that
 * runs on a developer's machine at every commit, so the execute bit has to survive — a hook that is
 * not executable fails silently at the moment it is supposed to protect something. Everything wider
 * is dropped: group and other write bits, setuid and setgid. A source at 0o777 places at 0o755.
 */
export function placementMode(sourceMode: number): number {
  return (sourceMode & ANY_EXECUTE) !== 0 ? MODE_EXECUTABLE : MODE_REGULAR;
}

// ---------------------------------------------------------------- which route

export type Route =
  | { readonly kind: 'local'; readonly path: string }
  | { readonly kind: 'fetch'; readonly ref: string | null };

export type RouteChoice =
  { readonly route: Route } | { readonly usageError: string };

/**
 * Which route a set of options selects. Two routes reach a resolved source, and they differ in more
 * than mechanism: the local route contacts no remote and reads no credential, which is what makes
 * it the one route a public CI can exercise.
 *
 * A ref with a local source is a usage error rather than a precedence rule: a ref selects among the
 * pinned repository's commits and says nothing about which commit a local tree is on, so picking a
 * winner would mean deciding which of two explicit instructions the caller meant.
 */
export function chooseRoute(options: {
  source: string | null;
  ref: string | null;
}): RouteChoice {
  if (options.source && options.ref) {
    return {
      usageError:
        '--ref selects a commit of the pinned repository and does not apply to a local source. ' +
        'Pass one or the other.',
    };
  }
  return options.source
    ? { route: { kind: 'local', path: options.source } }
    : { route: { kind: 'fetch', ref: options.ref } };
}

// ---------------------------------------------------------------- may we place here

/**
 * The source's declared collision policy, read from `distribution.upgrade` in the harness
 * manifest. Each field names the paths assigned to that resolution:
 *
 *   preserve   — the project's copy wins; the path is skipped on init
 *   regenerate — the harness's copy wins; the path is (over)written as normal
 *   merge      — combine both copies by the named strategy
 *
 * A path absent from all three lists is undeclared: init refuses rather than guessing.
 */
export interface UpgradePolicy {
  readonly preserve: readonly string[];
  readonly regenerate: readonly string[];
  readonly merge: ReadonlyArray<Readonly<Record<string, string>>>;
}

export interface MergeSpec {
  readonly path: string;
  readonly strategy: string;
}

export interface CollisionResolution {
  /** Paths where the project's copy wins — skip writing. */
  readonly preserve: readonly string[];
  /** Paths where the harness's copy wins — write normally. */
  readonly regenerate: readonly string[];
  /** Paths to combine via the named strategy. */
  readonly merge: readonly MergeSpec[];
  /** Paths with no declared policy — refuse. */
  readonly uncovered: readonly string[];
}

export const EMPTY_UPGRADE_POLICY: UpgradePolicy = {
  preserve: [],
  regenerate: [],
  merge: [],
};

/**
 * Classify a set of colliding paths against the source's declared upgrade policy.
 *
 * Every collision ends up in exactly one bucket. The `uncovered` bucket is the one that causes
 * a refusal — it means the source has not stated what to do with the path, so the installer
 * cannot act without guessing.
 */
export function classifyCollisions(
  collisions: readonly string[],
  policy: UpgradePolicy,
): CollisionResolution {
  const preserveSet = new Set(policy.preserve);
  const regenerateSet = new Set(policy.regenerate);
  const mergeMap = new Map<string, string>();
  for (const entry of policy.merge) {
    for (const [path, strategy] of Object.entries(entry)) {
      mergeMap.set(path, strategy);
    }
  }

  const preserve: string[] = [];
  const regenerate: string[] = [];
  const merge: MergeSpec[] = [];
  const uncovered: string[] = [];

  for (const path of collisions) {
    if (preserveSet.has(path)) {
      preserve.push(path);
    } else if (regenerateSet.has(path)) {
      regenerate.push(path);
    } else if (mergeMap.has(path)) {
      const strategy = mergeMap.get(path) ?? 'line-union';
      merge.push({ path, strategy });
    } else {
      uncovered.push(path);
    }
  }

  return { preserve, regenerate, merge, uncovered };
}

export interface TargetFacts {
  readonly target: string;
  readonly carriesHarness: boolean;
  /**
   * Declared paths that already exist in the target. Collision is what decides a refusal, path by
   * path — NOT whether the target is empty. A target with files of its own is a legitimate
   * placement target until one of them sits where the declared set would write.
   *
   * Pass only the UNCOVERED collisions (those with no declared upgrade policy) — the caller
   * classifies before calling here.
   */
  readonly collisions: readonly string[];
}

export function assessTarget(facts: TargetFacts): Refusal | null {
  if (facts.carriesHarness) {
    return { condition: 'target-carries-harness', target: facts.target };
  }
  if (facts.collisions.length > 0) {
    return {
      condition: 'target-file-collision',
      target: facts.target,
      paths: [...facts.collisions].sort(),
    };
  }
  return null;
}

// ---------------------------------------------------------------- who wires the floor

export interface TargetShape {
  readonly hasManifest: boolean;
  readonly hasWorkspaceConfig: boolean;
}

export type FloorAction =
  'defer' | 'wire-existing-manifest' | 'wire-and-write-manifest';

/**
 * Three outcomes, not two. An earlier version of the requirement keyed on a conjunction and its
 * full negation, which left an ordinary npm repository — a manifest, no workspace — matching
 * neither branch.
 *
 * `defer` exists because the floor is DEFINED by a generator in this suite rather than by this
 * package, and a second implementation here is how the two drift apart. But that generator needs a
 * workspace to run in, which is why this is a published binary at all.
 */
export function floorAction(shape: TargetShape): FloorAction {
  if (shape.hasManifest && shape.hasWorkspaceConfig) {
    return 'defer';
  }
  return shape.hasManifest
    ? 'wire-existing-manifest'
    : 'wire-and-write-manifest';
}
