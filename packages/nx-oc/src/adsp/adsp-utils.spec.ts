import { adspProjectTags, detectAdspEnv, detectAdspTenant } from './adsp-utils';

describe('adspProjectTags', () => {
  it('always includes the env tag', () => {
    expect(adspProjectTags('dev', undefined)).toEqual(['adsp:scaffold-env:dev']);
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
    expect(detectAdspEnv(['adsp:database:postgres', 'adsp:scaffold-env:dev'])).toBe('dev');
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
    expect(detectAdspTenant(['adsp:scaffold-env:dev', 'adsp:scaffold-tenant:autotest'])).toBe(
      'autotest'
    );
  });

  it('returns undefined when no adsp:scaffold-tenant: tag is present', () => {
    expect(detectAdspTenant([])).toBeUndefined();
  });

  it('returns undefined for an undefined tags array', () => {
    expect(detectAdspTenant(undefined)).toBeUndefined();
  });
});
