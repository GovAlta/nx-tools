import { ChildProcess, spawn } from 'child_process';
import { ReadableStreamBuffer } from 'stream-buffers';
import { mocked } from 'ts-jest/utils'
import { getPathCommitHashes } from './git-utils';

jest.mock('child_process');
const mockedSpawn = mocked(spawn);

describe('getPathCommitHashes', () => {

  it('can get commits', async (done) => {

    const stream = new ReadableStreamBuffer();
    stream.put('test1\ntest2\n');
    stream.stop();
    
    mockedSpawn.mockReturnValue({ stdout: stream } as unknown as ChildProcess)
    const commits = await getPathCommitHashes(
      'test', 
      ['test'],
      '',
      'HEAD'
    );

    expect(commits.length).toBe(2);
    expect(commits[0]).toBe('test1');
    expect(commits[1]).toBe('test2');
    expect(mockedSpawn.mock.calls.length).toBe(1);

    done();
  });
});