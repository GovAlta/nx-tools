import { execSync } from 'child_process';
import { mocked } from 'jest-mock';
import {
  getGitRemoteUrl,
  deriveRegistryFromRemote,
  getGitHubRepo,
} from './git-utils';

jest.mock('child_process');
const mockedExecSync = mocked(execSync);

describe('getGitRemoteUrl', () => {
  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it('returns the remote origin url', () => {
    mockedExecSync.mockReturnValue(
      Buffer.from('https://github.com/GovAlta/nx-tools.git\n'),
    );

    const url = getGitRemoteUrl();
    expect(url).toBe('https://github.com/GovAlta/nx-tools.git\n');
    expect(mockedExecSync).toHaveBeenCalledWith(
      'git config --get remote.origin.url',
      { stdio: 'pipe' },
    );
  });

  it('returns undefined when git command fails', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const url = getGitRemoteUrl();
    expect(url).toBeUndefined();
  });
});

describe('deriveRegistryFromRemote', () => {
  it('derives registry from HTTPS remote', () => {
    expect(
      deriveRegistryFromRemote('https://github.com/GovAlta/nx-tools.git'),
    ).toBe('ghcr.io/GovAlta');
  });

  it('derives registry from SSH remote', () => {
    expect(
      deriveRegistryFromRemote('git@github.com:GovAlta/nx-tools.git'),
    ).toBe('ghcr.io/GovAlta');
  });

  it('returns undefined for non-GitHub remote', () => {
    expect(
      deriveRegistryFromRemote('https://gitlab.com/org/repo.git'),
    ).toBeUndefined();
  });

  it('returns undefined when remoteUrl is undefined', () => {
    expect(deriveRegistryFromRemote(undefined)).toBeUndefined();
  });

  it('handles trailing newline from git output', () => {
    expect(
      deriveRegistryFromRemote('https://github.com/GovAlta/nx-tools.git\n'),
    ).toBe('ghcr.io/GovAlta');
  });
});

describe('getGitHubRepo', () => {
  it('returns owner/repo from HTTPS remote', () => {
    expect(getGitHubRepo('https://github.com/GovAlta/nx-tools.git')).toBe(
      'GovAlta/nx-tools',
    );
  });

  it('returns owner/repo from SSH remote', () => {
    expect(getGitHubRepo('git@github.com:GovAlta/nx-tools.git')).toBe(
      'GovAlta/nx-tools',
    );
  });

  it('handles trailing newline from git output', () => {
    expect(getGitHubRepo('https://github.com/GovAlta/nx-tools.git\n')).toBe(
      'GovAlta/nx-tools',
    );
  });

  it('returns undefined for non-GitHub remote', () => {
    expect(getGitHubRepo('https://gitlab.com/org/repo.git')).toBeUndefined();
  });

  it('returns undefined when remoteUrl is undefined', () => {
    expect(getGitHubRepo(undefined)).toBeUndefined();
  });
});

// CodeQL js/polynomial-redos flagged three patterns in this file. Both shapes
// below were measured against the old regexes before the fix, and the inputs are
// sized so the old code clearly exceeds the budget while the fixed code is ~0ms:
//
//   ssh prefix repeated:  2k -> 28ms,  8k -> 320ms      (quadratic)
//   interior whitespace:  6k -> 20ms, 20k -> 150ms, 40k -> 584ms, 50k -> ~900ms
//
// CodeQL also named a repeated-`https://github.com/a` shape for the same rule.
// That one measured linear on the old pattern (0.5ms at 8k, 2.2ms at 40k), so
// there is deliberately no test for it -- it could never fail.
//
// The budget is generous on purpose: this asserts the quadratic blow-up is gone,
// not the absolute speed of a CI machine.
describe('remote URL parsing is not quadratic on hostile input', () => {
  const BUDGET_MS = 250;

  const elapsed = (run: () => void): number => {
    const start = process.hrtime.bigint();
    run();
    return Number(process.hrtime.bigint() - start) / 1e6;
  };

  it('handles many repetitions of the ssh prefix quickly', () => {
    const hostile = 'git@github.com:'.repeat(8000);
    expect(elapsed(() => deriveRegistryFromRemote(hostile))).toBeLessThan(
      BUDGET_MS,
    );
  });

  // Interior whitespace with a non-space ending: this survives the trim, and it
  // is what made the removed `\s*$` backtrack at every expansion.
  it('handles interior whitespace with a non-space ending quickly', () => {
    const hostile = `https://github.com/a${' '.repeat(50000)}x`;
    expect(elapsed(() => getGitHubRepo(hostile))).toBeLessThan(BUDGET_MS);
  });
});

// Anchoring is what makes the patterns linear, so it is asserted rather than
// left implicit -- dropping the `^` would restore the quadratic behaviour while
// every other test still passed.
describe('remote URL parsing is anchored', () => {
  it('does not match a github URL embedded mid-string', () => {
    expect(
      deriveRegistryFromRemote('file:///tmp/https://github.com/evil/repo/'),
    ).toBeUndefined();
    expect(
      getGitHubRepo('file:///tmp/https://github.com/evil/repo.git'),
    ).toBeUndefined();
  });

  it('still accepts the two forms git config actually returns', () => {
    expect(deriveRegistryFromRemote('https://github.com/GovAlta/x.git')).toBe(
      'ghcr.io/GovAlta',
    );
    expect(deriveRegistryFromRemote('git@github.com:GovAlta/x.git')).toBe(
      'ghcr.io/GovAlta',
    );
    expect(getGitHubRepo('https://github.com/GovAlta/x.git')).toBe('GovAlta/x');
    expect(getGitHubRepo('git@github.com:GovAlta/x.git')).toBe('GovAlta/x');
  });
});
