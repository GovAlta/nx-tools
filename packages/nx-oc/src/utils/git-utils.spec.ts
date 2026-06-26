import { execSync } from 'child_process';
import { mocked } from 'jest-mock';
import { getGitRemoteUrl, deriveRegistryFromRemote, getGitHubRepo } from './git-utils';

jest.mock('child_process');
const mockedExecSync = mocked(execSync);

describe('getGitRemoteUrl', () => {
  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it('returns the remote origin url', () => {
    mockedExecSync.mockReturnValue(
      Buffer.from('https://github.com/GovAlta/nx-tools.git\n')
    );

    const url = getGitRemoteUrl();
    expect(url).toBe('https://github.com/GovAlta/nx-tools.git\n');
    expect(mockedExecSync).toHaveBeenCalledWith(
      'git config --get remote.origin.url',
      { stdio: 'pipe' }
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
    expect(deriveRegistryFromRemote('https://github.com/GovAlta/nx-tools.git'))
      .toBe('ghcr.io/GovAlta');
  });

  it('derives registry from SSH remote', () => {
    expect(deriveRegistryFromRemote('git@github.com:GovAlta/nx-tools.git'))
      .toBe('ghcr.io/GovAlta');
  });

  it('returns undefined for non-GitHub remote', () => {
    expect(deriveRegistryFromRemote('https://gitlab.com/org/repo.git')).toBeUndefined();
  });

  it('returns undefined when remoteUrl is undefined', () => {
    expect(deriveRegistryFromRemote(undefined)).toBeUndefined();
  });

  it('handles trailing newline from git output', () => {
    expect(deriveRegistryFromRemote('https://github.com/GovAlta/nx-tools.git\n'))
      .toBe('ghcr.io/GovAlta');
  });
});

describe('getGitHubRepo', () => {
  it('returns owner/repo from HTTPS remote', () => {
    expect(getGitHubRepo('https://github.com/GovAlta/nx-tools.git'))
      .toBe('GovAlta/nx-tools');
  });

  it('returns owner/repo from SSH remote', () => {
    expect(getGitHubRepo('git@github.com:GovAlta/nx-tools.git'))
      .toBe('GovAlta/nx-tools');
  });

  it('handles trailing newline from git output', () => {
    expect(getGitHubRepo('https://github.com/GovAlta/nx-tools.git\n'))
      .toBe('GovAlta/nx-tools');
  });

  it('returns undefined for non-GitHub remote', () => {
    expect(getGitHubRepo('https://gitlab.com/org/repo.git')).toBeUndefined();
  });

  it('returns undefined when remoteUrl is undefined', () => {
    expect(getGitHubRepo(undefined)).toBeUndefined();
  });
});
