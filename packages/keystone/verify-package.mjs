#!/usr/bin/env node
// project-docs-ancestors: cli-designs:keystone-init
//
// Assert what the published tarball contains, against an expected-file manifest kept beside it.
//
// WHY NOT AGAINST THE ALLOWLIST. Comparing packed output to `files` proves only that npm applied
// `files` — an allowlist that itself admitted harness content, a credential file, or local config
// would pass. The realistic way something reaches a public tarball is a directory or glob entry in
// that list quietly widening as files are added under it, which is invisible to any check treating
// the list as the oracle. So the oracle is this repository's own statement of what it ships.
//
// This runs on the PUBLISH path, not only in the unit suite: a gate that does not run where the
// publish happens does not prevent the publish it exists to prevent.
//
//   node packages/keystone/verify-package.mjs            # check
//   node packages/keystone/verify-package.mjs --update   # re-state the expectation, deliberately

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(here, '../../dist/packages/keystone');
const EXPECTED = join(here, 'expected-files.json');

if (!existsSync(PKG_ROOT)) {
  console.error(`verify-package: ${PKG_ROOT} does not exist — run \`nx build keystone\` first.`);
  process.exit(2);
}

const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: PKG_ROOT, encoding: 'utf-8' }),
);
const actual = packed[0].files.map((f) => f.path).sort();

if (process.argv.includes('--update')) {
  writeFileSync(EXPECTED, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`verify-package: recorded ${actual.length} expected file(s).`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(EXPECTED, 'utf-8')).sort();
const added = actual.filter((f) => !expected.includes(f));
const removed = expected.filter((f) => !actual.includes(f));

if (added.length === 0 && removed.length === 0) {
  console.log(`verify-package: ${actual.length} file(s), exactly as expected.`);
  process.exit(0);
}

console.error('verify-package: the published contents are not what this package expects to ship.');
for (const f of added) console.error(`  + ${f}   (would publish, not expected)`);
for (const f of removed) console.error(`  - ${f}   (expected, would not publish)`);
console.error(
  '\nIf this is intended, re-run with --update and review the diff — the point of the check is\n' +
    'that widening the file list is a decision on the record rather than a side effect.',
);
process.exit(1);
