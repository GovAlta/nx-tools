import { execFileSync, execSync } from 'child_process';
import { mocked } from 'jest-mock';
import {
  activeAccountScopes,
  checkGhCli,
  listGhSecretNames,
  listGhVariableNames,
  setGhSecret,
} from './gh-utils';

jest.mock('child_process');
const mockedExecFileSync = mocked(execFileSync);
const mockedExecSync = mocked(execSync);

const ACTIVE_WITH_REPO = `github.com
  ✓ Logged in to github.com account someone (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org', 'repo'
`;

const ACTIVE_WITHOUT_REPO = `github.com
  ✓ Logged in to github.com account someone (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org'
`;

describe('activeAccountScopes', () => {
  it("extracts the active account's scopes, ignoring an inactive account's", () => {
    const status = `github.com
  ✓ Logged in to github.com account other (keyring)
  - Active account: false
  - Token scopes: 'workflow'

  ✓ Logged in to github.com account active (keyring)
  - Active account: true
  - Token scopes: 'repo', 'write:packages'
`;
    expect(activeAccountScopes(status)).toEqual(['repo', 'write:packages']);
  });

  it('returns undefined when no active account block can be found', () => {
    expect(activeAccountScopes('')).toBeUndefined();
  });
});

describe('checkGhCli', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
    mockedExecSync.mockReset();
  });

  it('does not throw when gh is authenticated and no scope is required', () => {
    mockedExecSync.mockReturnValue(Buffer.from('Logged in to github.com'));
    expect(() => checkGhCli()).not.toThrow();
  });

  it('throws a clear error when gh CLI is unavailable or unauthenticated', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('gh: command not found');
    });
    expect(() => checkGhCli()).toThrow(
      'gh CLI is not installed or not authenticated',
    );
  });

  it('does not throw when the active account has the required scope', () => {
    mockedExecSync.mockReturnValue(Buffer.from(ACTIVE_WITH_REPO));
    expect(() => checkGhCli('repo')).not.toThrow();
  });

  it('throws an actionable error when the active account is missing the required scope', () => {
    mockedExecSync.mockReturnValue(Buffer.from(ACTIVE_WITHOUT_REPO));
    expect(() => checkGhCli('repo')).toThrow(
      /missing the 'repo' scope[\s\S]*gh auth refresh -h github.com -s repo/,
    );
  });

  it('does not throw when scopes cannot be determined at all (fails open)', () => {
    mockedExecSync.mockReturnValue(Buffer.from(''));
    expect(() => checkGhCli('repo')).not.toThrow();
  });
});

describe('setGhSecret', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from(''));
    expect(setGhSecret('OPENSHIFT_TOKEN', 'tok', 'GovAlta/nx-tools')).toBe(
      true,
    );
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['secret', 'set', 'OPENSHIFT_TOKEN', '--repo', 'GovAlta/nx-tools'],
      expect.objectContaining({ input: Buffer.from('tok') }),
    );
  });

  it('returns false when gh command fails', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('gh: not found');
    });
    expect(setGhSecret('OPENSHIFT_TOKEN', 'tok', 'GovAlta/nx-tools')).toBe(
      false,
    );
  });
});

describe('listGhSecretNames', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('parses the JSON name list', () => {
    mockedExecFileSync.mockReturnValue(
      Buffer.from(JSON.stringify([{ name: 'A' }, { name: 'B' }])),
    );
    expect(listGhSecretNames('GovAlta/nx-tools')).toEqual(['A', 'B']);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['secret', 'list', '--repo', 'GovAlta/nx-tools', '--json', 'name'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );
  });

  it('throws rather than returning [] on failure — a caller deciding whether a write is safe must never treat "could not check" the same as "confirmed absent"', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('gh: not found');
    });
    expect(() => listGhSecretNames('GovAlta/nx-tools')).toThrow();
  });
});

describe('listGhVariableNames', () => {
  beforeEach(() => mockedExecFileSync.mockReset());

  it('parses the JSON name list', () => {
    mockedExecFileSync.mockReturnValue(
      Buffer.from(JSON.stringify([{ name: 'X' }])),
    );
    expect(listGhVariableNames('GovAlta/nx-tools')).toEqual(['X']);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['variable', 'list', '--repo', 'GovAlta/nx-tools', '--json', 'name'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );
  });

  it('throws on failure, same as listGhSecretNames', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('gh: not found');
    });
    expect(() => listGhVariableNames('GovAlta/nx-tools')).toThrow();
  });
});
