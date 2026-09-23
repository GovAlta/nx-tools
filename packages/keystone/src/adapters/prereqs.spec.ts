// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync, spawnSync } from 'child_process';
import { ensurePrereqs } from './prereqs';
import { Environment } from './diagnose';

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  spawnSync: jest.fn(() => ({ status: 0 })),
}));

const mockExecFileSync = execFileSync as jest.MockedFunction<
  typeof execFileSync
>;
const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;

const fullyEquipped: Environment = {
  gitPresent: true,
  ghPresent: true,
  ghAuthenticated: true,
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('ensurePrereqs', () => {
  it('does nothing when gh is not present', () => {
    const err = jest.fn();
    ensurePrereqs(err, {
      ...fullyEquipped,
      ghPresent: false,
      ghAuthenticated: false,
    });

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('runs setup-git when gh is present and authenticated', () => {
    const err = jest.fn();
    ensurePrereqs(err, fullyEquipped);

    expect(mockExecFileSync).toHaveBeenCalledWith('gh', ['auth', 'setup-git'], {
      stdio: 'ignore',
    });
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it('does nothing when not authenticated and not a TTY', () => {
    const err = jest.fn();
    ensurePrereqs(err, { ...fullyEquipped, ghAuthenticated: false }, false);

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('announces and spawns gh auth login when not authenticated and a TTY, then runs setup-git', () => {
    const err = jest.fn();
    ensurePrereqs(err, { ...fullyEquipped, ghAuthenticated: false }, true);

    expect(err).toHaveBeenCalledWith(expect.stringContaining('gh auth login'));
    expect(mockSpawnSync).toHaveBeenCalledWith('gh', ['auth', 'login'], {
      stdio: 'inherit',
    });
    expect(mockExecFileSync).toHaveBeenCalledWith('gh', ['auth', 'setup-git'], {
      stdio: 'ignore',
    });
  });

  it('skips setup-git when gh auth login is aborted', () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1 } as ReturnType<
      typeof spawnSync
    >);
    const err = jest.fn();
    ensurePrereqs(err, { ...fullyEquipped, ghAuthenticated: false }, true);

    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('does not throw when setup-git itself fails', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('setup-git failed');
    });
    const err = jest.fn();
    expect(() => ensurePrereqs(err, fullyEquipped)).not.toThrow();
  });
});
