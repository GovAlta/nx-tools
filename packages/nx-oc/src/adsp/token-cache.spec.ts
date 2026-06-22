import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCacheFilePath, getCachedToken, isExpired, setCachedToken, CacheEntry } from './token-cache';

jest.mock('fs');
jest.mock('os');

const mockedFs = jest.mocked(fs);
const mockedOs = jest.mocked(os);

const FAKE_HOME = '/home/testuser';
const CACHE_PATH = path.join(FAKE_HOME, '.nx-adsp', 'token-cache.json');

const ACCESS_URL = 'https://access.example.com/auth';
const REALM = 'my-tenant';

function futureIso(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function pastIso(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

describe('getCacheFilePath', () => {
  it('returns path under home directory', () => {
    mockedOs.homedir.mockReturnValue(FAKE_HOME);
    expect(getCacheFilePath()).toBe(CACHE_PATH);
  });
});

describe('isExpired', () => {
  it('returns false when token expires in the future (beyond buffer)', () => {
    const entry: CacheEntry = { accessToken: 'tok', expiresAt: futureIso(120) };
    expect(isExpired(entry)).toBe(false);
  });

  it('returns true when token is past its expiry', () => {
    const entry: CacheEntry = { accessToken: 'tok', expiresAt: pastIso(10) };
    expect(isExpired(entry)).toBe(true);
  });

  it('returns true when token expires within the 60-second buffer', () => {
    const entry: CacheEntry = { accessToken: 'tok', expiresAt: futureIso(30) };
    expect(isExpired(entry)).toBe(true);
  });
});

describe('getCachedToken', () => {
  beforeEach(() => {
    mockedOs.homedir.mockReturnValue(FAKE_HOME);
  });

  it('returns null when cache file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(getCachedToken(ACCESS_URL, REALM)).toBeNull();
  });

  it('returns null when realm is not in cache', () => {
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ 'other::realm': { accessToken: 'x', expiresAt: futureIso(3600) } }));
    expect(getCachedToken(ACCESS_URL, REALM)).toBeNull();
  });

  it('returns the cached entry when present', () => {
    const entry: CacheEntry = { accessToken: 'abc', refreshToken: 'ref', expiresAt: futureIso(3600) };
    const key = `${ACCESS_URL}::${REALM}`;
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ [key]: entry }));

    expect(getCachedToken(ACCESS_URL, REALM)).toEqual(entry);
  });
});

describe('setCachedToken', () => {
  beforeEach(() => {
    mockedOs.homedir.mockReturnValue(FAKE_HOME);
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    (mockedFs.writeFileSync as jest.Mock).mockReset();
    (mockedFs.mkdirSync as jest.Mock).mockReset();
  });

  it('writes a new entry with correct fields', () => {
    setCachedToken(ACCESS_URL, REALM, 'access-tok', 'refresh-tok', 3600);

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      CACHE_PATH,
      expect.stringContaining('"accessToken": "access-tok"'),
      expect.objectContaining({ mode: 0o600 })
    );

    const written = JSON.parse((mockedFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    const entry = written[`${ACCESS_URL}::${REALM}`];
    expect(entry.accessToken).toBe('access-tok');
    expect(entry.refreshToken).toBe('refresh-tok');
    expect(new Date(entry.expiresAt).getTime()).toBeGreaterThan(Date.now() + 3590 * 1000);
  });

  it('writes without refreshToken when not provided', () => {
    setCachedToken(ACCESS_URL, REALM, 'access-tok', undefined, 3600);

    const written = JSON.parse((mockedFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    const entry = written[`${ACCESS_URL}::${REALM}`];
    expect(entry.refreshToken).toBeUndefined();
  });

  it('creates the cache directory if it does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);

    setCachedToken(ACCESS_URL, REALM, 'tok', undefined, 300);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
      path.dirname(CACHE_PATH),
      expect.objectContaining({ recursive: true, mode: 0o700 })
    );
  });
});
