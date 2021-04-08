import { Commit } from 'semantic-release';
import { mocked } from 'ts-jest/utils'
import { wrapPlugin } from './wrap-plugin';
import { getProjectChangePaths } from './nx-util';
import { getPathCommitHashes } from './git-utils';

jest.mock('./nx-util');
const mockedGetProjectChangePaths = mocked(getProjectChangePaths);
jest.mock('./git-utils');
const mockedGetPathCommitHashes = mocked(getPathCommitHashes);

describe('wrapPlugin', () => {
  
  it('can wrap plugin function', () => {
    const wrapped = wrapPlugin(jest.fn());
    expect(wrapped).toBeTruthy();
    expect(typeof wrapped).toBe('function');
  });

  it('can filter commits', async (done) => {
    const plugin = jest.fn();
    plugin.mockReturnValue('result');
    jest.mock('./git-utils');
    const wrapped = wrapPlugin(plugin);

    mockedGetProjectChangePaths.mockReturnValueOnce(
      Promise.resolve(['test1'])
    );

    mockedGetPathCommitHashes.mockReturnValue(
      Promise.resolve(['test1'])
    );
    
    const logger = { 
      log: jest.fn(),
      error: jest.fn()
    }

    const result = await wrapped(
      { project: 'test', config: 'config' }, 
      {
        commits: [
          { commit: { long: 'test1', short: 'test1' } } as Commit,
          { commit: { long: 'test2', short: 'test2' } } as Commit
        ], 
        logger, 
        env: {}, 
        cwd: ''
      }
    );

    expect(result).toBe('result');
    expect(plugin.mock.calls.length).toBe(1);
    expect(plugin.mock.calls[0][0].config).toBe('config');
    expect(plugin.mock.calls[0][1].commits.length).toBe(1);
    expect(plugin.mock.calls[0][1].commits[0].commit.long).toBe('test1');

    done();
  });
});
