// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  cachePath,
  checkNotRedirected,
  FetchRedirected,
  fetchSource,
  PINNED_REMOTE,
} from './fetch-source';
import { git, GitError } from './git';
import { makeSource, remoteOf } from '../testing/fixture';

// The fetch route, exercised against a LOCAL BARE REPOSITORY standing in for the remote.
//
// domain-models:source-resolution's route table names this as the difference between the two
// routes rather than an inconvenience: a test cannot reach the pinned repository, so the fetch
// adapter takes the remote as a parameter while the command always passes the pinned constant.
// There is no option that redirects a real invocation.

jest.setTimeout(120000);

function scratchCache(): string {
  return join(mkdtempSync(join(tmpdir(), 'keystone-cache-')), 'clone');
}

describe('fetchSource, against a local remote', () => {
  // req-006 rule 10: a fetched source is cached, and reuse of the cache is observable.
  it('creates the cache on first fetch and reuses it on the second', () => {
    const remote = remoteOf(makeSource());
    const cacheDir = scratchCache();

    const first = fetchSource({ ref: null, remote, cacheDir });
    expect(first.cache).toBe('created');
    expect(existsSync(join(cacheDir, '.claude/inventory.json'))).toBe(true);

    const second = fetchSource({ ref: null, remote, cacheDir });
    expect(second.cache).toBe('reused');
    // The cache directory's identity is unchanged, which is the rule's own clause.
    expect(second.root).toBe(first.root);
    expect(second.commit).toBe(first.commit);
  });

  // req-006 rule 4: a moving reference resolves against the REMOTE, not the cache. A stale cache
  // would otherwise place yesterday's tree while reporting today's branch name.
  it('follows the remote when the default branch advances, rather than the cache', () => {
    const source = makeSource();
    const remote = remoteOf(source);
    const cacheDir = scratchCache();

    const before = fetchSource({ ref: null, remote, cacheDir });

    writeFileSync(join(source, 'AGENTS.md'), '# moved on\n');
    execFileSync('git', ['-C', source, 'commit', '-qam', 'advance'], {
      stdio: 'ignore',
    });
    execFileSync('git', ['-C', source, 'push', '--quiet'], { stdio: 'ignore' });

    const after = fetchSource({ ref: null, remote, cacheDir });

    expect(after.commit).not.toBe(before.commit);
    expect(after.cache).toBe('reused');
  });

  // req-006 rule 5: a tag, a branch, or a commit.
  it('honours a tag, a branch and a commit', () => {
    const source = makeSource();
    const remote = remoteOf(source);
    const head = git(['rev-parse', 'HEAD'], source);
    execFileSync('git', ['-C', source, 'tag', 'v9.9.9'], { stdio: 'ignore' });
    execFileSync('git', ['-C', source, 'push', '--quiet', '--tags'], {
      stdio: 'ignore',
    });

    expect(
      fetchSource({ ref: 'v9.9.9', remote, cacheDir: scratchCache() }).commit,
    ).toBe(head);
    expect(
      fetchSource({ ref: 'main', remote, cacheDir: scratchCache() }).commit,
    ).toBe(head);
    expect(
      fetchSource({ ref: head, remote, cacheDir: scratchCache() }).commit,
    ).toBe(head);
  });

  it('fails with the git output available when the ref does not exist', () => {
    const remote = remoteOf(makeSource());

    let caught: unknown;
    try {
      fetchSource({ ref: 'no-such-ref', remote, cacheDir: scratchCache() });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GitError);
  });

  // req-006 rule 6. A rewrite cannot be cleared for one invocation, so it is verified instead:
  // what matters is whether the effective URL still designates the same repository.
  it('detects a rewrite that designates a different repository', () => {
    const remote = remoteOf(makeSource());
    const elsewhere = remoteOf(makeSource());
    const cacheDir = scratchCache();
    mkdirSync(cacheDir, { recursive: true });
    git(['init', '--quiet'], cacheDir);
    git(['config', '--local', `url.${elsewhere}.insteadOf`, remote], cacheDir);

    const refusal = checkNotRedirected(remote, undefined, cacheDir);

    expect(refusal).toMatchObject({ condition: 'fetch-remote-redirected' });
  });

  it('allows a rewrite that reaches the same repository over another transport', () => {
    // The maintainer's case: an SSH alias standing in for the canonical HTTPS URL. Same
    // repository, different transport — refusing it would make this route unusable for exactly
    // the people who configured it.
    const cacheDir = scratchCache();
    mkdirSync(cacheDir, { recursive: true });
    git(['init', '--quiet'], cacheDir);
    git(
      [
        'config',
        '--local',
        'url.git@github-work:.insteadOf',
        'https://github.com/',
      ],
      cacheDir,
    );

    expect(
      checkNotRedirected(PINNED_REMOTE, 'GovAlta-EMU/keystone', cacheDir),
    ).toBeNull();
  });
});

describe('the redirect control, in the shape production uses', () => {
  const FAKE = ['NOT', 'A', 'REAL', 'TOKEN'].join('_');

  // The bug this exists for: the check resolved rewrites against process.cwd() while the fetch ran
  // with cwd set to the cache — whose OWN local config git also honours. So a rewrite in the cache
  // bypassed the check entirely and the run fetched the other repository. Both earlier tests
  // passed an explicit cwd; the production call was the one shape nothing exercised.
  it('catches a rewrite living in the cache the fetch will run in', () => {
    const remote = remoteOf(makeSource());
    const elsewhere = remoteOf(makeSource());
    const cacheDir = scratchCache();
    mkdirSync(cacheDir, { recursive: true });
    git(['init', '--quiet'], cacheDir);
    git(['config', '--local', `url.${elsewhere}.insteadOf`, remote], cacheDir);

    let caught: unknown;
    try {
      fetchSource({ ref: null, remote, cacheDir });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FetchRedirected);
  });

  // A cache with no origin could not self-heal: `remote set-url` fails outright, and init and
  // remote-add being two calls meant an interruption between them poisoned the cache for good —
  // whose git error was then answered with a credentials remediation.
  it('repairs a cache that has a .git but no origin', () => {
    const remote = remoteOf(makeSource());
    const cacheDir = scratchCache();
    mkdirSync(cacheDir, { recursive: true });
    git(['init', '--quiet'], cacheDir);

    const result = fetchSource({ ref: null, remote, cacheDir });

    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  // The refusal interpolates a POST-rewrite URL, which is exactly where a credentialled rewrite
  // puts a secret.
  it('does not carry a credential in the refusal it produces', () => {
    const remote = 'https://github.com/GovAlta-EMU/keystone.git';
    const cacheDir = scratchCache();
    mkdirSync(cacheDir, { recursive: true });
    git(['init', '--quiet'], cacheDir);
    git(
      [
        'config',
        '--local',
        `url.https://ci-user:${FAKE}@github.com/other-org/.insteadOf`,
        'https://github.com/GovAlta-EMU/',
      ],
      cacheDir,
    );

    const refusal = checkNotRedirected(
      remote,
      'GovAlta-EMU/keystone',
      cacheDir,
    );

    expect(refusal).not.toBeNull();
    expect(JSON.stringify(refusal)).not.toContain(FAKE);
    expect(JSON.stringify(refusal)).toContain('redacted');
  });
});

describe('cachePath', () => {
  it('is deterministic, so the cache directory is assertable across runs', () => {
    const env = { XDG_CACHE_HOME: '/tmp/xdg' } as NodeJS.ProcessEnv;

    expect(cachePath('GovAlta-EMU/keystone', env)).toBe(
      '/tmp/xdg/abgov-keystone/GovAlta-EMU-keystone',
    );
    expect(cachePath('GovAlta-EMU/keystone', env)).toBe(
      cachePath('GovAlta-EMU/keystone', env),
    );
  });

  it('derives the pinned remote from the pinned repository, over HTTPS', () => {
    expect(PINNED_REMOTE).toBe('https://github.com/GovAlta-EMU/keystone.git');
  });
});
