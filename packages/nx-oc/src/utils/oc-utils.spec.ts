import { execFileSync, spawnSync } from 'child_process';
import { mocked } from 'jest-mock';
import {
  ensureOcLogin,
  runOcCommand,
  getOcServerUrl,
  getSaToken,
  createDockerRegistrySecret,
  linkSecretToServiceAccount,
} from './oc-utils';

jest.mock('child_process');
const mockedExecFileSync = mocked(execFileSync);
const mockedSpawnSync = mocked(spawnSync);

const SPAWN_OK = { status: 0, pid: 1, output: [], stdout: Buffer.from(''), stderr: Buffer.from(''), signal: null };
const SPAWN_FAIL = { ...SPAWN_OK, status: 1 };

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

describe('ensureOcLogin', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
    mockedSpawnSync.mockReset();
  });

  it('returns without spawning login when already logged in', () => {
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('Client Version: 4.14.0')); // oc version --client
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('developer'));               // oc whoami

    ensureOcLogin();

    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it('throws a clear error when oc is not installed', () => {
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('oc: command not found');
    });

    expect(() => ensureOcLogin()).toThrow('oc CLI is not installed');
  });

  it('spawns oc login with server and --web when kubeconfig has a current context', () => {
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('Client Version: 4.14.0'));                  // oc version --client
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('not logged in'); });         // oc whoami
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('https://api.example.openshift.com:6443')); // oc config view
    mockedSpawnSync.mockReturnValue(SPAWN_OK);

    ensureOcLogin();

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'oc',
      ['login', 'https://api.example.openshift.com:6443', '--web'],
      { stdio: 'inherit' }
    );
  });

  it('spawns oc login with only --web when no kubeconfig exists', () => {
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('Client Version: 4.14.0'));          // oc version --client
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('not logged in'); }); // oc whoami
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('no config'); });     // oc config view

    mockedSpawnSync.mockReturnValue(SPAWN_OK);

    ensureOcLogin();

    expect(mockedSpawnSync).toHaveBeenCalledWith('oc', ['login', '--web'], { stdio: 'inherit' });
  });

  it('throws when login is cancelled or fails', () => {
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('Client Version: 4.14.0'));          // oc version --client
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('not logged in'); }); // oc whoami
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('no config'); });     // oc config view

    mockedSpawnSync.mockReturnValue(SPAWN_FAIL);

    expect(() => ensureOcLogin()).toThrow('OpenShift login failed or was cancelled');
  });
});

describe('getOcServerUrl', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns the server URL from kubeconfig', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from('https://api.example.com:6443'));
    expect(getOcServerUrl()).toBe('https://api.example.com:6443');
  });

  it('returns undefined when oc command fails', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('no config'); });
    expect(getOcServerUrl()).toBeUndefined();
  });
});

describe('getSaToken', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns token from oc create token', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from('eyJhbGciOi...'));
    expect(getSaToken('github-actions', 'my-infra')).toBe('eyJhbGciOi...');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'oc', ['create', 'token', 'github-actions', '-n', 'my-infra', '--duration=8760h'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('falls back to oc sa get-token when create token fails', () => {
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('unsupported'); }); // oc create token
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('legacy-token'));                  // oc sa get-token
    expect(getSaToken('github-actions', 'my-infra')).toBe('legacy-token');
  });

  it('returns undefined when both commands fail', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(getSaToken('github-actions', 'my-infra')).toBeUndefined();
  });
});

describe('createDockerRegistrySecret', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from('secret/ghcr-pull-secret created'));
    expect(createDockerRegistrySecret('ghcr-pull-secret', 'ghcr.io', 'org', 'pat', 'my-infra')).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'oc',
      ['create', 'secret', 'docker-registry', 'ghcr-pull-secret',
       '--docker-server=ghcr.io', '--docker-username=org', '--docker-password=pat',
       '-n', 'my-infra'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('returns false when oc command fails', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('already exists'); });
    expect(createDockerRegistrySecret('ghcr-pull-secret', 'ghcr.io', 'org', 'pat', 'my-infra')).toBe(false);
  });
});

describe('linkSecretToServiceAccount', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));
    expect(linkSecretToServiceAccount('ghcr-pull-secret', 'github-actions', 'my-infra')).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'oc',
      ['secrets', 'link', 'github-actions', 'ghcr-pull-secret', '--for=pull', '-n', 'my-infra'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('returns false when oc command fails', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(linkSecretToServiceAccount('ghcr-pull-secret', 'github-actions', 'my-infra')).toBe(false);
  });
});
