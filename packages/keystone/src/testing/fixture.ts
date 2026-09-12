// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PINNED_REPOSITORY, SOURCE_LAYOUT } from '../adapters/source';

// Fixtures for the tests that run placement for real. Excluded from the build and from the
// published file allowlist, so this never ships — which is the allowlist in req-011 doing work
// rather than being declared.

export function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

/**
 * A fixture that stands in for the harness source: its own manifest, its own predicate module, a
 * git index, and the awkward cases — an ignored dependency cache, an untracked file, an excluded
 * directory holding one exception, and an executable hook.
 */
export function makeSource(
  options: {
    repo?: string;
    withDistribution?: boolean;
    withUpstream?: boolean;
    withSkills?: boolean;
  } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'keystone-source-'));
  const repo = options.repo ?? PINNED_REPOSITORY;
  const withDistribution = options.withDistribution ?? true;

  mkdirSync(join(root, '.claude/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/refs/donor'), { recursive: true });
  mkdirSync(join(root, '.husky'), { recursive: true });
  mkdirSync(join(root, 'template/app/node_modules/dep'), { recursive: true });

  const manifest: Record<string, unknown> = {
    harness: { name: 'Fixture', version: '9.9.9', sourceRepo: repo },
    // A real source declares its steps, and the handoff VERIFIES the name it prints against this
    // rather than carrying one. A fixture without it would only ever exercise the "declares no
    // configuration step" branch.
    ...((options.withSkills ?? true)
      ? { skills: [{ id: 'setup' }, { id: 'build' }, { id: 'ship' }] }
      : {}),
  };
  if (withDistribution) {
    manifest.distribution = {
      include: ['.claude', 'template', '.husky', 'AGENTS.md'],
      exclude: ['.claude/refs/'],
      except: ['.claude/refs/donor/'],
    };
  }
  writeFileSync(
    join(root, SOURCE_LAYOUT.manifest),
    JSON.stringify(manifest, null, 2),
  );

  // The source's OWN predicate, exported the way the real source exports it. The installer must
  // read this rather than reimplement it, so the fixture supplies a real module.
  writeFileSync(
    join(root, SOURCE_LAYOUT.predicateModule),
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'const here = path.dirname(new URL(import.meta.url).pathname);',
      "const manifest = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'inventory.json'), 'utf8'));",
      'const d = manifest.distribution || {};',
      'const hits = (list, p) => (list || []).some((e) => { const t = e.replace(/\\/+$/, in_); return p === t || p.startsWith(t + "/"); });',
      'export function travels(p) {',
      '  if (hits(d.except, p)) return true;',
      '  if (hits(d.exclude, p)) return false;',
      '  return hits(d.include, p);',
      '}',
    ]
      .join('\n')
      .replace('in_', "''"),
  );

  writeFileSync(join(root, 'AGENTS.md'), '# fixture agents\n');
  writeFileSync(
    join(root, '.claude/refs/history.md'),
    'keystone own history, excluded\n',
  );
  writeFileSync(
    join(root, '.claude/refs/donor/example.md'),
    'a worked example that travels\n',
  );
  writeFileSync(join(root, 'template/app/index.ts'), 'export const x = 1;\n');
  writeFileSync(join(root, '.husky/pre-commit'), '#!/bin/sh\necho hook\n');
  chmodSync(join(root, '.husky/pre-commit'), 0o755);

  // Ignored: a dependency cache, and a generated file. Neither is tracked, so neither can travel.
  writeFileSync(join(root, '.gitignore'), 'node_modules\ngenerated.html\n');
  writeFileSync(
    join(root, 'template/app/node_modules/dep/index.js'),
    'module.exports = {};\n',
  );
  writeFileSync(
    join(root, 'generated.html'),
    '<html>generated, ignored</html>\n',
  );
  // Untracked and not ignored either: still absent from the index, so still cannot travel.
  writeFileSync(join(root, 'AGENTS.untracked.md'), 'never committed\n');

  // `-b main` explicitly: `git init` uses the machine's own `init.defaultBranch`, so a fixture
  // that leaves it to chance passes where that is `main` and fails on a runner where it is
  // `master` — which is exactly how the branch-name test passed locally and failed in CI.
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, [
    'add',
    '.claude',
    'template',
    '.husky',
    'AGENTS.md',
    '.gitignore',
  ]);
  git(root, ['commit', '-qm', 'fixture']);

  // A source with no upstream is REFUSED as unreproducible, so the ordinary fixture has one: a
  // bare sibling at `<root>.git`, pushed and tracked. It doubles as a local remote, which is the
  // only way the fetch route is testable — a test cannot reach the pinned repository.
  if (options.withUpstream ?? true) {
    const bare = remoteOf(root);
    // `-b main` on the BARE repo too, not only the working one. Without it the bare repo's HEAD
    // points at whatever `init.defaultBranch` says — `master` on a CI runner — so a push of
    // `main` leaves HEAD dangling and `ls-remote --symref` advertises no default branch at all.
    // Same class as pinning the working repo's branch, one repository over. Measured both ways.
    execFileSync('git', ['init', '--bare', '--quiet', '-b', 'main', bare], {
      stdio: 'ignore',
    });
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '--quiet', '-u', 'origin', 'HEAD']);
  }

  return root;
}

/** The bare repository standing in for a remote, for a source made by `makeSource`. */
export function remoteOf(sourceRoot: string): string {
  return `${sourceRoot}.git`;
}

export function makeTarget(): string {
  return mkdtempSync(join(tmpdir(), 'keystone-target-'));
}
