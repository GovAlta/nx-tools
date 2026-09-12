// project-docs-ancestors: cli-designs:keystone-init

import { designatedRepository, designates } from './repository-url';

// Assembled rather than written as a literal, for the reason redact.spec.ts records: the scanner
// flags a literal `user:token@host` anywhere, including a test, and is right to.
const CREDENTIALLED = `https://user:${['NOT', 'A', 'REAL', 'TOKEN'].join('_')}@github.com/GovAlta-EMU/keystone.git`;

// This is a security control, not a formatting helper: it is what decides whether a rewritten URL
// still reaches the pinned repository, and a rewrite cannot be cleared for a single invocation.
describe('designatedRepository', () => {
  it.each([
    ['https://github.com/GovAlta-EMU/keystone.git', 'GovAlta-EMU/keystone'],
    ['https://github.com/GovAlta-EMU/keystone', 'GovAlta-EMU/keystone'],
    [CREDENTIALLED, 'GovAlta-EMU/keystone'],
    [
      'ssh://git@github.com:22/GovAlta-EMU/keystone.git',
      'GovAlta-EMU/keystone',
    ],
    ['git@github.com:GovAlta-EMU/keystone.git', 'GovAlta-EMU/keystone'],
    // The maintainer's case: a host alias that exists on one machine, same repository.
    ['git@github-work:GovAlta-EMU/keystone.git', 'GovAlta-EMU/keystone'],
    ['https://github.com/GovAlta-EMU/keystone.git/', 'GovAlta-EMU/keystone'],
  ])('reads %s as %s', (url, expected) => {
    expect(designatedRepository(url)).toBe(expected);
  });

  it('designates nothing for a filesystem path, which names no repository identity', () => {
    expect(designatedRepository('/var/tmp/some/bare.git')).toBeNull();
    expect(designatedRepository('keystone')).toBeNull();
  });
});

// CodeQL flagged two polynomial regexes here, and it was right about the exposure: this input is a
// URL produced by the machine's own git rewriting, so a hostile `insteadOf` value reaches it. These
// inputs are the shapes it named — a long run of the character each quantifier could backtrack over.
describe('adversarial input', () => {
  it.each([
    ['trailing slashes', `https://github.com/o/r${'/'.repeat(50000)}`],
    ['repeated .@', `${'.@'.repeat(25000)}`],
    ['repeated .@.:', `${'.@.:'.repeat(20000)}`],
    ['no scheme, no at', '/'.repeat(50000)],
  ])('completes on %s', (_name, input) => {
    const started = Date.now();

    expect(() => designatedRepository(input)).not.toThrow();

    // A quadratic backtrack on inputs this size does not finish in a second; a linear scan is
    // microseconds. The assertion is deliberately loose — it is catching a hang, not measuring.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still reads a normal URL correctly after the rewrite', () => {
    expect(
      designatedRepository('https://github.com/GovAlta-EMU/keystone.git'),
    ).toBe('GovAlta-EMU/keystone');
  });
});

describe('designates', () => {
  it('accepts another transport reaching the same repository', () => {
    expect(
      designates(
        'git@github-work:GovAlta-EMU/keystone.git',
        'GovAlta-EMU/keystone',
      ),
    ).toBe(true);
  });

  it('rejects a different repository under the same host', () => {
    expect(
      designates('https://github.com/someone/else.git', 'GovAlta-EMU/keystone'),
    ).toBe(false);
  });

  it('rejects a same-named repository under a different owner', () => {
    expect(
      designates(
        'https://github.com/attacker/keystone.git',
        'GovAlta-EMU/keystone',
      ),
    ).toBe(false);
  });

  it('compares case-insensitively, as GitHub does', () => {
    expect(
      designates(
        'https://github.com/govalta-emu/KEYSTONE.git',
        'GovAlta-EMU/keystone',
      ),
    ).toBe(true);
  });
});
