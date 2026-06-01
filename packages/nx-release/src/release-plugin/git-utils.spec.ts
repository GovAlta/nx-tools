import { ChildProcess, spawn } from 'child_process';
import { ReadableStreamBuffer } from 'stream-buffers';
import { mocked } from 'jest-mock'
import { clearCache, getPathCommitHashes } from './git-utils';

jest.mock('child_process');
const mockedSpawn = mocked(spawn);

describe('git-utils', () => {

  beforeEach(() => {
    mockedSpawn.mockReset();
    clearCache();
  });

  describe('getPathCommitHashes', () => {
  
    it('can get commits', async () => {

      const stdout = new ReadableStreamBuffer();
      stdout.put('test1\ntest2\n');
      stdout.stop();

      const stderr = new ReadableStreamBuffer();
      stderr.stop();

      mockedSpawn.mockReturnValue({
        stdout,
        stderr,
        on: jest.fn((event, cb) => { if (event === 'close') cb(0); }),
      } as unknown as ChildProcess);

      const commits = await getPathCommitHashes(
        '/repo',
        'test', 
        ['test'],
        '',
        'HEAD'
      );
  
      expect(commits.length).toBe(2);
      expect(commits[0]).toBe('test1');
      expect(commits[1]).toBe('test2');
      expect(mockedSpawn.mock.calls.length).toBe(1);
    });
  });
});
