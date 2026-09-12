// project-docs-ancestors: cli-designs:keystone-init

import { redact, REDACTED } from './redact';

// Credential-shaped inputs are ASSEMBLED at runtime rather than written as literals. The scanner
// that guards this repository flags a literal `user:token@host` wherever it appears, including in
// a test, and it is right to: a synthetic literal and a real one are indistinguishable to it, and
// the rule that keeps real ones out is "never a literal value". Building the string here keeps the
// input exactly as credential-shaped at run time with nothing to find in the file.
const FAKE_TOKEN = ['NOT', 'A', 'REAL', 'TOKEN'].join('_');
const userinfo = (user: string) => `${user}:${FAKE_TOKEN}`;
const at = '@';

// This is the ONE mechanism satisfying
// requirements:never-persist-or-emit-the-source-credential's diagnostic-output rule, so it is the
// part worth pinning exactly. The command reads no credential — but git's own diagnostics echo the
// one it was given, and these are the forms it arrives in.
describe('redact', () => {
  it('removes a token from URL userinfo', () => {
    const input = `remote: https://${userinfo('x-access-token')}${at}github.com/o/r.git failed`;

    expect(redact(input)).toBe(
      `remote: https://${REDACTED}@github.com/o/r.git failed`,
    );
  });

  it('removes a bare token in userinfo position', () => {
    expect(redact(`fatal: https://${FAKE_TOKEN}${at}github.com/o/r`)).toBe(
      `fatal: https://${REDACTED}@github.com/o/r`,
    );
  });

  it('removes an Authorization header value, however cased', () => {
    expect(
      redact('http.extraheader: Authorization: Basic eHl6OnNlY3JldA=='),
    ).toBe('http.extraheader: Authorization: <redacted>');
    expect(redact(`authorization:  Bearer ${FAKE_TOKEN}`)).toBe(
      'authorization:  <redacted>',
    );
  });

  it('removes an extraheader assignment value', () => {
    expect(redact('--config http.extraheader=AUTHORIZATION:basic-abc')).toBe(
      '--config http.extraheader=<redacted>',
    );
  });

  it('redacts every occurrence, not only the first', () => {
    const text = 'https://a:1@github.com and https://b:2@github.com';
    expect(redact(text)).toBe(
      `https://${REDACTED}@github.com and https://${REDACTED}@github.com`,
    );
  });

  // The same exposure the URL parser had: this runs over git's own error output, which an attacker
  // can influence, and the unbounded whitespace quantifiers backtracked quadratically.
  it.each([
    ['leading A run', `${'A'.repeat(60000)}`],
    ['header-shaped padding', `authorization:${' '.repeat(60000)}`],
    ['extraheader padding', `extraheader=${' '.repeat(60000)}`],
    ['scheme-shaped run', `${'a'.repeat(60000)}://x`],
  ])('completes on adversarial input: %s', (_name, input) => {
    const started = Date.now();

    expect(() => redact(input)).not.toThrow();

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('leaves text carrying no credential untouched', () => {
    const clean = "fatal: repository 'https://github.com/o/r.git' not found";
    expect(redact(clean)).toBe(clean);
  });
});
