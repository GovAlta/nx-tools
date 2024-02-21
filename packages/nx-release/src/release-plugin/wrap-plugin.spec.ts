import type { Commit, VerifyReleaseContext } from 'semantic-release';
import { mocked } from 'jest-mock';
import { wrapPlugin } from './wrap-plugin';
import { getProjectChangePaths } from './nx-util';
import { getPathCommitHashes } from './git-utils';

jest.mock('./nx-util');
const mockedGetProjectChangePaths = mocked(getProjectChangePaths);
jest.mock('./git-utils');
const mockedGetPathCommitHashes = mocked(getPathCommitHashes);

describe('wrapPlugin', () => {
  beforeEach(() => {
    mockedGetProjectChangePaths.mockReset();
    mockedGetPathCommitHashes.mockReset();
  });

  it('can wrap plugin function', () => {
    const wrapped = wrapPlugin(jest.fn());
    expect(wrapped).toBeTruthy();
    expect(typeof wrapped).toBe('function');
  });

  it('can filter commits', async () => {
    const plugin = jest.fn();
    plugin.mockReturnValue('result');
    jest.mock('./git-utils');
    const wrapped = wrapPlugin(plugin);

    mockedGetProjectChangePaths.mockReturnValue(Promise.resolve(['test1']));

    mockedGetPathCommitHashes.mockReturnValue(Promise.resolve(['test1']));

    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const result = await wrapped(
      { project: 'test', config: 'config' },
      {
        commits: [
          { commit: { long: 'test1', short: 'test1' } } as Commit,
          { commit: { long: 'test2', short: 'test2' } } as Commit,
        ],
        logger,
        env: {},
        cwd: '',
        stderr: null,
        stdout: null,
      } as unknown as VerifyReleaseContext
    );

    expect(result).toBe('result');
    expect(plugin.mock.calls.length).toBe(1);
    expect(plugin.mock.calls[0][0].config).toBe('config');
    expect(plugin.mock.calls[0][1].commits.length).toBe(1);
    expect(plugin.mock.calls[0][1].commits[0].commit.long).toBe('test1');
  });

  it('can skip filtering if no project configured', async () => {
    const plugin = jest.fn();
    plugin.mockReturnValue('result');
    const wrapped = wrapPlugin(plugin);

    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const result = await wrapped(
      { project: null, config: 'config' },
      {
        commits: [
          { commit: { long: 'test1', short: 'test1' } } as Commit,
          { commit: { long: 'test2', short: 'test2' } } as Commit,
        ],
        logger,
        env: {},
        cwd: '',
      } as unknown as VerifyReleaseContext
    );

    expect(result).toBe('result');
    expect(plugin.mock.calls.length).toBe(1);
    expect(plugin.mock.calls[0][1].commits.length).toBe(2);
  });
});
