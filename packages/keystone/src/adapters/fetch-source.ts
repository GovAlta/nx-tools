// project-docs-ancestors: cli-designs:keystone-init

import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { redact } from '../core/redact';
import { designatedRepository, designates } from '../core/repository-url';
import { Refusal } from '../core/refusal';
import { git } from './git';
import { PINNED_REPOSITORY } from './source';

export const PINNED_REMOTE = `https://github.com/${PINNED_REPOSITORY}.git`;

/**
 * Where a fetched clone is kept between runs.
 *
 * Deterministic so "the cache directory's identity is unchanged" across runs is something a test
 * can assert rather than an intention.
 */
export function cachePath(
  repository: string = PINNED_REPOSITORY,
  env = process.env,
): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'abgov-keystone', repository.replace('/', '-'));
}

/**
 * What the machine's git configuration will actually contact for a given URL.
 *
 * `url.<base>.insteadOf` rewrites globally and cannot be cleared for one invocation, so the only
 * honest control is to ask what the URL resolves to and check it still designates the pinned
 * repository. Transport may differ — an SSH alias reaching the same repository is how a
 * maintainer's machine authenticates, and refusing that would make this route unusable for exactly
 * the people who configured it. A different repository is the hazard.
 */
export function effectiveRemote(url: string, cwd?: string): string {
  return git(['ls-remote', '--get-url', url], cwd) || url;
}

/**
 * null when the machine's configuration leaves the URL designating what it asked for.
 *
 * The expectation defaults to what the given URL itself designates, rather than to the pinned
 * repository: the question is whether a rewrite CHANGED the destination, which is asked the same
 * way whatever URL is passed. A URL designating no owner/name at all — a filesystem path, which is
 * what makes this route testable — is compared verbatim, since there is no repository identity to
 * compare instead.
 */
export function checkNotRedirected(
  url: string,
  repository?: string,
  cwd?: string,
): Refusal | null {
  const effective = effectiveRemote(url, cwd);
  const expected = repository ?? designatedRepository(url);

  // REDACTED AT CONSTRUCTION. `effective` is the URL after rewriting, which is exactly where a
  // rewrite of the form `url.https://<user>:<token>@host/other-org/.insteadOf` puts a credential —
  // the CI shape the design itself names. The refusal is rendered verbatim, so redacting later
  // would be one forgotten call away from a leak.
  if (expected === null) {
    return effective === url
      ? null
      : {
          condition: 'fetch-remote-redirected',
          effective: redact(effective),
          repository: url,
        };
  }
  return designates(effective, expected)
    ? null
    : {
        condition: 'fetch-remote-redirected',
        effective: redact(effective),
        repository: expected,
      };
}

export interface FetchResult {
  readonly root: string;
  readonly commit: string;
  readonly cache: 'created' | 'reused';
}

/**
 * Fetch the pinned repository at a ref, into the cache, and return the tree and resolved commit.
 *
 * `remote` is a PARAMETER and the command always passes the pinned constant: no option redirects
 * the fetch, and there is no way for a caller to reach this with a different value. It is a
 * parameter because the fetch route is otherwise unverifiable — a test cannot reach the real
 * repository, and the route table in domain-models:source-resolution names that as the difference
 * between the two routes rather than an inconvenience.
 */
export class FetchRedirected extends Error {
  constructor(readonly refusal: Refusal) {
    super('fetch-remote-redirected');
  }
}

export function fetchSource(options: {
  ref: string | null;
  remote?: string;
  cacheDir?: string;
  /** Which repository the remote must designate. Defaults to the pinned one. */
  repository?: string;
}): FetchResult {
  const remote = options.remote ?? PINNED_REMOTE;
  const root = options.cacheDir ?? cachePath();

  const created = !existsSync(join(root, '.git'));

  if (created) {
    mkdirSync(root, { recursive: true });
    git(['init', '--quiet'], root);
  }

  // `config remote.origin.url` creates OR updates, which matters twice. It re-asserts the remote
  // rather than trusting a cache whose origin was edited; and it cannot fail on a cache that has
  // no origin — which `remote set-url` did. `init` and `remote add` were two calls, so an
  // interruption between them left a cache permanently poisoned, and the resulting git error was
  // then handed to the credential diagnosis, answering a purely local problem with a login
  // remediation.
  git(['config', 'remote.origin.url', remote], root);

  // CHECKED INSIDE THE CACHE, which is the context the fetch itself runs in. Resolving the rewrite
  // anywhere else — the invoking directory, say — checks a configuration git will not consult:
  // measured, a `url.<other>.insteadOf` in the cache's own local config passed the check and then
  // fetched the other repository, and the cache is a long-lived directory. Both tests of this
  // control passed an explicit cwd; the production call was the one shape nothing exercised.
  const redirected = checkNotRedirected(remote, options.repository, root);
  if (redirected) {
    throw new FetchRedirected(redirected);
  }

  // A moving reference is resolved against the REMOTE, never against the cache. A stale cache
  // would otherwise place yesterday's tree while reporting today's branch name.
  const ref = options.ref ?? defaultBranch(root);
  git(['fetch', '--quiet', '--depth', '1', 'origin', ref], root);
  git(['checkout', '--quiet', '--force', 'FETCH_HEAD'], root);

  return {
    root,
    commit: git(['rev-parse', 'HEAD'], root),
    cache: created ? 'created' : 'reused',
  };
}

/** The remote's own default branch, asked of the remote rather than assumed to be any name. */
function defaultBranch(root: string): string {
  const shown = git(['ls-remote', '--symref', 'origin', 'HEAD'], root);
  const match = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(shown);
  if (!match) {
    // Not a guess dressed as a fact: if the remote does not advertise a default, say so rather
    // than trying `main` and reporting a ref the caller never asked for.
    throw new Error(
      'the remote advertises no default branch; pass --ref explicitly',
    );
  }
  return match[1];
}
