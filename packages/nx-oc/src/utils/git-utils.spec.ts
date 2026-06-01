import { execSync } from 'child_process';
import { mocked } from 'jest-mock';
import { getGitRemoteUrl } from './git-utils';

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
