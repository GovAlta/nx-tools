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
  console.error(
    `verify-package: ${PKG_ROOT} does not exist — run \`nx build keystone\` first.`,
  );
  process.exit(2);
}

const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PKG_ROOT,
    encoding: 'utf-8',
  }),
);
const actual = packed[0].files.map((f) => f.path).sort();

if (process.argv.includes('--update')) {
  writeFileSync(EXPECTED, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`verify-package: recorded ${actual.length} expected file(s).`);
  process.exit(0);
}

// Zero dependencies has to be true of the OUTPUT, not just the manifest. The workspace sets
// `importHelpers`, so a helper emitted into the build makes the package require `tslib` while
// declaring nothing — which works in the monorepo, where tslib is hoisted, and fails for every
// consumer. Found by installing the tarball; asserted here so the publish path catches it.
const helperRequires = actual
  .filter((f) => f.endsWith('.js'))
  .filter((f) =>
    /require\(["']tslib["']\)/.test(readFileSync(join(PKG_ROOT, f), 'utf-8')),
  );
if (helperRequires.length > 0) {
  console.error(
    'verify-package: these files require `tslib`, which this package does not declare:\n' +
      helperRequires.map((f) => `  ${f}`).join('\n') +
      '\n\nThe build emitted a TypeScript helper. Either target a runtime that needs none, or\n' +
      'declare the dependency — the first keeps the zero-dependency rule the credential path\n' +
      'relies on.',
  );
  process.exit(1);
}

// THE BIN SURVIVES PUBLISHING, which npm only warns about. A `bin` path written `./src/...` is
// silently stripped at publish time — "script name src/bin/keystone.js was invalid and removed" —
// leaving a package whose entire purpose is a binary with no binary, installed fine and
// uninvokable. Measured: the `./` form auto-corrects, the bare form does not. npm's own warning
// scrolls past in a wall of tarball notices, so it is asserted here instead.
const manifest = JSON.parse(
  readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'),
);
const binEntries = Object.entries(manifest.bin ?? {});
if (binEntries.length === 0) {
  console.error(
    'verify-package: this package declares no bin, and it is a bin package.',
  );
  process.exit(1);
}
for (const [name, target] of binEntries) {
  if (
    typeof target !== 'string' ||
    target.startsWith('./') ||
    target.startsWith('/')
  ) {
    console.error(
      `verify-package: bin["${name}"] is "${target}". npm strips a bin path written that way at\n` +
        'publish time and only warns, so the published package would have no runnable binary.\n' +
        `Write it relative with no leading "./" — "${String(target).replace(/^\.\//, '')}".`,
    );
    process.exit(1);
  }
  if (!actual.includes(target)) {
    console.error(
      `verify-package: bin["${name}"] points at "${target}", which is not in the packed files.`,
    );
    process.exit(1);
  }
}

const expected = JSON.parse(readFileSync(EXPECTED, 'utf-8')).sort();
const added = actual.filter((f) => !expected.includes(f));
const removed = expected.filter((f) => !actual.includes(f));

if (added.length === 0 && removed.length === 0) {
  console.log(`verify-package: ${actual.length} file(s), exactly as expected.`);
  process.exit(0);
}

console.error(
  'verify-package: the published contents are not what this package expects to ship.',
);
for (const f of added)
  console.error(`  + ${f}   (would publish, not expected)`);
for (const f of removed)
  console.error(`  - ${f}   (expected, would not publish)`);
console.error(
  '\nIf this is intended, re-run with --update and review the diff — the point of the check is\n' +
    'that widening the file list is a decision on the record rather than a side effect.',
);
process.exit(1);
