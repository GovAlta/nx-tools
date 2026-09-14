// project-docs-ancestors: cli-designs:keystone-init

import { existsSync, readFileSync } from 'fs';
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

  // The bug this exists for, found by installing the tarball rather than by reasoning: the
  // workspace sets `importHelpers: true`, so TypeScript emitted `require("tslib")` — and this
  // package declares zero dependencies by requirement. It worked in the monorepo because tslib is
  // hoisted there, and failed for every consumer with "Cannot find module 'tslib'". Fixed by
  // targeting a runtime that needs no helpers rather than by taking the dependency, because the
  // zero-dependency rule has a security rationale: no transitive surface on the code path that
  // handles a credential.
  it('emits no helper imports, so zero dependencies is true of the output and not just the manifest', () => {
    const root = join(
      __dirname,
      '..',
      '..',
      '..',
      'dist',
      'packages',
      'keystone',
    );
    if (!existsSync(root)) {
      // Nothing built here; the publish-path check in verify-package.mjs covers this too.
      return;
    }

    const offenders = expected
      .filter((f) => f.endsWith('.js'))
      .filter((f) => {
        const path = join(root, f);
        return (
          existsSync(path) &&
          /require\(["']tslib["']\)/.test(readFileSync(path, 'utf-8'))
        );
      });

    expect(offenders).toEqual([]);
  });

  it('declares an expectation at all, which is what makes the check meaningful', () => {
    expect(expected.length).toBeGreaterThan(0);
    // Sorted and unique, so a diff against packed output is stable.
    expect([...new Set(expected)].sort()).toEqual([...expected].sort());
  });
});
