// project-docs-ancestors: cli-designs:keystone-init

import { readFileSync } from 'fs';
import { join } from 'path';

// req-011. The expectation this package publishes against is a file in this repository, and these
// are the properties that make it worth having: the safety claim is "carries no harness content",
// and an allowlist is the control for it only if something checks what the allowlist admits.
//
// The comparison itself runs against a real `npm pack` on the publish path (verify-package.mjs);
// this asserts the properties of the recorded expectation, which is cheap and needs no build.

const expected: string[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'expected-files.json'), 'utf-8'),
);

describe('the published file list', () => {
  it('ships no harness content', () => {
    // The distributed harness lives under .claude/ and template/; neither has any business here.
    expect(
      expected.filter((f) => /(^|\/)(\.claude|template)\//.test(f)),
    ).toEqual([]);
  });

  it('ships no test material or fixtures', () => {
    expect(
      expected.filter((f) => f.includes('.spec.') || f.includes('/testing/')),
    ).toEqual([]);
  });

  it('ships no local configuration or credential-bearing file kinds', () => {
    expect(
      expected.filter((f) =>
        /(^|\/)(\.npmrc|\.env|.*\.pem|.*\.key|\.git)/.test(f),
      ),
    ).toEqual([]);
  });

  it('ships the binary the package declares, and a readme', () => {
    expect(expected).toContain('src/bin/keystone.js');
    expect(expected).toContain('README.md');
  });

  it('declares an expectation at all, which is what makes the check meaningful', () => {
    expect(expected.length).toBeGreaterThan(0);
    // Sorted and unique, so a diff against packed output is stable.
    expect([...new Set(expected)].sort()).toEqual([...expected].sort());
  });
});
