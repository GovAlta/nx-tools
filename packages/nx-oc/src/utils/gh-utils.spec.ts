import { execFileSync } from 'child_process';
import { mocked } from 'jest-mock';
import { checkGhCli, setGhSecret } from './gh-utils';

jest.mock('child_process');
const mockedExecFileSync = mocked(execFileSync);

describe('checkGhCli', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('does not throw when gh is authenticated', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from('Logged in to github.com'));
    expect(() => checkGhCli()).not.toThrow();
  });

  it('throws a clear error when gh CLI is unavailable or unauthenticated', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('gh: command not found'); });
    expect(() => checkGhCli()).toThrow('gh CLI is not installed or not authenticated');
  });
});

describe('setGhSecret', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));
    expect(setGhSecret('OPENSHIFT_TOKEN', 'tok', 'GovAlta/nx-tools')).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['secret', 'set', 'OPENSHIFT_TOKEN', '--repo', 'GovAlta/nx-tools'],
      expect.objectContaining({ input: Buffer.from('tok') })
    );
  });

  it('returns false when gh command fails', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('gh: not found'); });
    expect(setGhSecret('OPENSHIFT_TOKEN', 'tok', 'GovAlta/nx-tools')).toBe(false);
  });
});
