import { spawnSync } from 'child_process';
import { getAccessToken } from '@abgov/adsp-cli';
import { isNonInteractive } from '../utils/interactive';
import {
  adspProjectTags,
  detectAdspEnv,
  detectAdspTenant,
  ensureAdspToken,
} from './adsp-utils';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawnSync: jest.fn(),
}));
jest.mock('@abgov/adsp-cli', () => ({
  ...jest.requireActual('@abgov/adsp-cli'),
  getAccessToken: jest.fn(),
}));
jest.mock('../utils/interactive', () => ({ isNonInteractive: jest.fn() }));

const mockedGetAccessToken = getAccessToken as jest.Mock;
const mockedSpawnSync = spawnSync as jest.Mock;
const mockedIsNonInteractive = isNonInteractive as jest.Mock;

describe('adspProjectTags', () => {
  it('always includes the env tag', () => {
    expect(adspProjectTags('dev', undefined)).toEqual([
      'adsp:scaffold-env:dev',
    ]);
  });

  it('includes a tenant tag when given a tenant', () => {
    expect(adspProjectTags('test', 'autotest')).toEqual([
      'adsp:scaffold-env:test',
      'adsp:scaffold-tenant:autotest',
    ]);
  });
});

describe('detectAdspEnv', () => {
  it('finds the adsp:scaffold-env: tag among other tags', () => {
    expect(
      detectAdspEnv(['adsp:database:postgres', 'adsp:scaffold-env:dev']),
    ).toBe('dev');
  });

  it('returns undefined when no adsp:scaffold-env: tag is present', () => {
    expect(detectAdspEnv(['adsp:database:postgres'])).toBeUndefined();
  });

  it('returns undefined for an undefined tags array', () => {
    expect(detectAdspEnv(undefined)).toBeUndefined();
  });
});

describe('detectAdspTenant', () => {
  it('finds the adsp:scaffold-tenant: tag among other tags', () => {
    expect(
      detectAdspTenant([
        'adsp:scaffold-env:dev',
        'adsp:scaffold-tenant:autotest',
      ]),
    ).toBe('autotest');
  });

  it('returns undefined when no adsp:scaffold-tenant: tag is present', () => {
    expect(detectAdspTenant([])).toBeUndefined();
  });

  it('returns undefined for an undefined tags array', () => {
    expect(detectAdspTenant(undefined)).toBeUndefined();
  });
});

describe('ensureAdspToken', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ADSP_TENANT_REALM;
    mockedGetAccessToken.mockReset();
    mockedSpawnSync.mockReset();
    mockedIsNonInteractive.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the token from the fast path without touching ADSP_TENANT_REALM when no realm is given', async () => {
    mockedGetAccessToken.mockResolvedValue({ status: 'ok', token: 'tok' });

    const token = await ensureAdspToken({ env: 'test' });

    expect(token).toBe('tok');
    expect(process.env.ADSP_TENANT_REALM).toBeUndefined();
  });

  it('sets ADSP_TENANT_REALM to the given realm for the duration of the call', async () => {
    let seenDuringCall: string | undefined;
    mockedGetAccessToken.mockImplementation(async () => {
      seenDuringCall = process.env.ADSP_TENANT_REALM;
      return { status: 'ok', token: 'tok' };
    });

    await ensureAdspToken({ env: 'test', realm: 'realm-abc' });

    expect(seenDuringCall).toBe('realm-abc');
    expect(process.env.ADSP_TENANT_REALM).toBeUndefined();
  });

  it('restores a pre-existing ADSP_TENANT_REALM after the call, rather than leaving the new one set', async () => {
    process.env.ADSP_TENANT_REALM = 'pre-existing-realm';
    mockedGetAccessToken.mockResolvedValue({ status: 'ok', token: 'tok' });

    await ensureAdspToken({ env: 'test', realm: 'realm-abc' });

    expect(process.env.ADSP_TENANT_REALM).toBe('pre-existing-realm');
  });

  it('throws with the CI credentials alternative mentioned, in a non-interactive run with no token', async () => {
    mockedGetAccessToken.mockResolvedValue({ status: 'not-authenticated' });
    mockedIsNonInteractive.mockReturnValue(true);

    await expect(
      ensureAdspToken({ env: 'test', tenant: 'my-tenant' }),
    ).rejects.toThrow(/ADSP_CLIENT_ID and ADSP_CLIENT_SECRET/);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it('drives an interactive login and retries when the fast path misses', async () => {
    mockedIsNonInteractive.mockReturnValue(false);
    mockedGetAccessToken
      .mockResolvedValueOnce({ status: 'not-authenticated' })
      .mockResolvedValueOnce({ status: 'ok', token: 'tok-after-login' });
    mockedSpawnSync.mockReturnValue({ status: 0 });

    const token = await ensureAdspToken({ env: 'test', tenant: 'my-tenant' });

    expect(token).toBe('tok-after-login');
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
  });

  it('restores ADSP_TENANT_REALM (deleting it) even when the call throws', async () => {
    mockedGetAccessToken.mockResolvedValue({ status: 'not-authenticated' });
    mockedIsNonInteractive.mockReturnValue(true);

    await expect(
      ensureAdspToken({ env: 'test', realm: 'realm-abc' }),
    ).rejects.toThrow();

    expect(process.env.ADSP_TENANT_REALM).toBeUndefined();
  });
});
