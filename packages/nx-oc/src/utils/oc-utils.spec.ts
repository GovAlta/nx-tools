import { execSync } from 'child_process';
import { mocked } from 'jest-mock';
import { runOcCommand } from './oc-utils';

jest.mock('child_process');
const mockedExecSync = mocked(execSync);

describe('runOcCommand', () => {
  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it('returns success with stdout on successful command', () => {
    const output = Buffer.from('project set to test-dev');
    mockedExecSync.mockReturnValue(output);

    const result = runOcCommand('project', ['test-dev']);
    expect(result.success).toBe(true);
    expect(result.stdout).toBe(output);
  });

  it('builds the correct command string without input', () => {
    mockedExecSync.mockReturnValue(Buffer.from(''));

    runOcCommand('process', ['-f .openshift/app.yml', '-p ENV=dev']);
    expect(mockedExecSync).toHaveBeenCalledWith(
      'oc process -f .openshift/app.yml -p ENV=dev',
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('uses cat pipe form when input buffer is provided', () => {
    mockedExecSync.mockReturnValue(Buffer.from(''));
    const input = Buffer.from('{"kind":"List"}');

    runOcCommand('apply', [], input);
    const [cmd] = mockedExecSync.mock.calls[0];
    expect(cmd).toContain('cat |');
    expect(cmd).toContain('oc apply -f -');
  });

  it('passes input buffer to execSync', () => {
    mockedExecSync.mockReturnValue(Buffer.from(''));
    const input = Buffer.from('yaml-content');

    runOcCommand('apply', [], input);
    const [, options] = mockedExecSync.mock.calls[0];
    expect((options as { input: Buffer }).input).toBe(input);
  });

  it('returns failure when command throws', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('oc: command not found');
    });

    const result = runOcCommand('start-build', ['my-pipeline']);
    expect(result.success).toBe(false);
    expect(result.stdout).toBeUndefined();
  });
});
