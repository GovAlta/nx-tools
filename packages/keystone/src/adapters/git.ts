// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';

export interface GitFailure {
  readonly command: string;
  readonly output: string;
}

export class GitError extends Error {
  constructor(readonly failure: GitFailure) {
    super(failure.command);
  }
}

/**
 * Configuration forced on every invocation.
 *
 * `core.askPass` and `GIT_TERMINAL_PROMPT` are off so a missing credential fails rather than
 * blocking on an interactive prompt nothing is watching.
 *
 * A previous version also tried to clear `url.<base>.insteadOf` here, to stop the machine's own
 * configuration redirecting a fetch. **That cannot be done and the attempt was actively harmful:**
 * `-c url.X.insteadOf=` does not unset a rewrite, it sets the match prefix to the empty string,
 * which matches every URL — measured, it redirected every fetch to github.com. Excluding the
 * global config wholesale would work but would also drop the credential helper, which lives in the
 * same file and is what authenticates the fetch. So the rewrite is VERIFIED rather than prevented:
 * see `core/repository-url.ts` and the effective-URL check in `fetch-source.ts`.
 */
const FORCED_CONFIG = ['-c', 'core.askPass='];

// Built PER CALL, not once at import. A module-level snapshot ignores any later change to the
// environment, which makes every env-dependent behaviour untestable and is a latent surprise for
// anything that sets a variable after loading this module.
const nonInteractiveEnv = () => ({ ...process.env, GIT_TERMINAL_PROMPT: '0' });

/** Run git, returning stdout. Throws GitError carrying the combined output on failure. */
export function git(args: readonly string[], cwd?: string): string {
  const full = [...FORCED_CONFIG, ...args];
  try {
    return execFileSync('git', full, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: nonInteractiveEnv(),
    }).trim();
  } catch (error) {
    const e = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      message?: string;
    };
    const output = [e.stdout, e.stderr]
      .map((part) => (part ? part.toString() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new GitError({
      command: `git ${args.join(' ')}`,
      output: output || e.message || 'git failed with no output',
    });
  }
}

export function gitAvailable(): boolean {
  try {
    git(['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Facts about a local source's reproducibility, all read from what is on disk. */
export interface LocalFacts {
  readonly dirty: boolean;
  /**
   * A tracking ref exists for the current branch, so `@{u}` resolves.
   *
   * SPLIT FROM `containedRemotely`, because conflating them cost a real defect. One flag meant
   * "this commit is fetchable from some remote ref" and was then consumed by a read that needs "a
   * tracking ref exists" — so a clone checked out at a release tag, where the commit IS in a remote
   * ref and `@{u}` does not resolve, set the flag true and then threw on `@{u}..HEAD`. Two facts,
   * two names, and the read below can only take the one it needs.
   */
  readonly hasTrackingRef: boolean;
  /** The commit is reachable from some remote-tracking ref, whether or not `@{u}` resolves. */
  readonly containedRemotely: boolean;
  /** Commits the tracking ref does not have. Zero when there is no tracking ref to compare with. */
  readonly aheadBy: number;
}

/** Whether git can read this path as a repository at all — the one thing that means "not a source". */
export function isGitRepository(root: string): boolean {
  try {
    git(['rev-parse', '--git-dir'], root);
    return true;
  } catch {
    return false;
  }
}

export function readLocalFacts(root: string): LocalFacts {
  // An explicit repository probe rather than a commit read whose value nobody used. It still
  // throws for a path git cannot read as a repository, which is what the caller turns into a
  // refusal — but it says that is its purpose, and the commit comes from the resolved source so a
  // second copy of it here only invited a reader to use the wrong one.
  git(['rev-parse', '--git-dir'], root);

  // TRACKED changes only. `--porcelain` alone reports untracked files too, and an untracked file
  // cannot make a placement unreproducible: the declared set is drawn from the index, so untracked
  // content can never travel. Counting it would refuse every ordinary working clone — which is
  // what a fixture carrying a deliberate untracked file caught.
  const dirty =
    git(['status', '--porcelain', '--untracked-files=no'], root).length > 0;

  let hasTrackingRef = true;
  try {
    git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root);
  } catch {
    hasTrackingRef = false;
  }

  // A commit contained in any remote-tracking ref is fetchable by someone else, whichever way the
  // tree arrived at it — which is what a detached checkout at a release tag looks like, and it is
  // the most reproducible source shape there is.
  let containedRemotely = hasTrackingRef;
  if (!hasTrackingRef) {
    try {
      containedRemotely =
        git(['branch', '-r', '--contains', 'HEAD'], root).length > 0;
    } catch {
      containedRemotely = false;
    }
  }

  // Gated on the TRACKING REF, not on reachability: `@{u}..HEAD` is only answerable when `@{u}`
  // resolves. With no tracking ref there is nothing to be ahead of, and reachability is carried by
  // `containedRemotely` instead. Counted locally, never by contacting a remote — the local route's
  // no-network property is what makes it the testable one.
  const aheadBy = hasTrackingRef
    ? Number.parseInt(
        git(['rev-list', '--count', '@{u}..HEAD'], root) || '0',
        10,
      )
    : 0;

  return { dirty, hasTrackingRef, containedRemotely, aheadBy };
}
