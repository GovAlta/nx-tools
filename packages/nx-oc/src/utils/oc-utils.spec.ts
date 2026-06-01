import { execFileSync } from 'child_process';
import { mocked } from 'jest-mock';
import { runOcCommand } from './oc-utils';

jest.mock('child_process');
const mockedExecFileSync = mocked(execFileSync);

describe('runOcCommand', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it('returns success with stdout on successful command', () => {
    const output = Buffer.from('project set to test-dev');
    mockedExecFileSync.mockReturnValue(output);

    const result = runOcCommand('project', ['test-dev']);
    expect(result.success).toBe(true);
    expect(result.stdout).toBe(output);
  });

  it('builds the correct args array without input', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));

    runOcCommand('process', ['-f', '.openshift/app.yml', '-p', 'ENV=dev']);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'oc',
      ['process', '-f', '.openshift/app.yml', '-p', 'ENV=dev'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('prepends -f - when input buffer is provided', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));
    const input = Buffer.from('{"kind":"List"}');

    runOcCommand('apply', [], input);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'oc',
      ['apply', '-f', '-'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('passes input buffer to execFileSync', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));
    const input = Buffer.from('yaml-content');

    runOcCommand('apply', [], input);
    const [, , options] = mockedExecFileSync.mock.calls[0];
    expect((options as { input: Buffer }).input).toBe(input);
  });

  it('returns failure when command throws', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('oc: command not found');
    });

    const result = runOcCommand('start-build', ['my-pipeline']);
    expect(result.success).toBe(false);
    expect(result.stdout).toBeUndefined();
  });
});
