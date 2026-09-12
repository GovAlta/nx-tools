// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { floorAction, TargetShape } from '../core/rules';
import { Refusal } from '../core/refusal';
import { git } from './git';

const HOOKS_PATH = '.husky';
const REAPPLY = `git config core.hooksPath ${HOOKS_PATH}`;

export function readTargetShape(target: string): TargetShape {
  return {
    hasManifest: existsSync(join(target, 'package.json')),
    hasWorkspaceConfig: existsSync(join(target, 'nx.json')),
  };
}

/**
 * An already-configured hook path is never replaced.
 *
 * `core.hooksPath` is repository-wide and single-valued, so overwriting it disables whatever check
 * the team already had there — which in this repository's own idiom is a secret scan.
 */
export function checkHooksPath(target: string): Refusal | null {
  let existing = '';
  try {
    existing = git(['config', '--get', 'core.hooksPath'], target);
  } catch {
    return null; // unset: git exits non-zero
  }
  return existing && existing !== HOOKS_PATH
    ? { condition: 'target-configures-hooks-path', target, value: existing }
    : null;
}

export interface WireResult {
  readonly floor: 'deferred' | 'wired';
  readonly gitInitialised: boolean;
  readonly manifestWritten: boolean;
}

/**
 * Make the placed target a project: a repository, a wired hook path, and a manifest to keep it
 * wired.
 *
 * The hook path is the one fact no placed file can carry, and it is PER-CLONE rather than a
 * one-time install step — it lives in .git/config, which is never committed. So the manifest's
 * re-apply step is not a convenience: without it, every later clone of this project has a
 * pre-commit hook that is present and inert, which is precisely the defect this package exists to
 * remove and is invisible when it happens.
 */
export function wire(
  target: string,
  options: { noGit?: boolean } = {},
): WireResult {
  let gitInitialised = false;
  if (!options.noGit && !existsSync(join(target, '.git'))) {
    git(['init', '--quiet'], target);
    gitInitialised = true;
  }

  const action = floorAction(readTargetShape(target));
  let manifestWritten = false;

  if (action === 'defer') {
    // The floor is defined by a generator in this suite, so it is invoked rather than
    // reimplemented — it also installs husky, which owns the same wiring.
    execFileSync(
      'npx',
      ['nx', 'g', '@abgov/nx-agent:init', '--no-interactive'],
      {
        cwd: target,
        stdio: 'ignore',
      },
    );
  } else {
    git(['config', 'core.hooksPath', HOOKS_PATH], target);
    manifestWritten = ensureManifest(
      target,
      action === 'wire-and-write-manifest',
    );
  }

  // The floor's own gate is NOT run here. The harness has a preflight skill whose job is exactly
  // that — checking this copy and its environment, including that the tree is a git work tree —
  // so running it ourselves duplicated a harness capability. The handoff names it instead.
  return {
    floor: action === 'defer' ? 'deferred' : 'wired',
    gitInitialised,
    manifestWritten,
  };
}

/** The re-apply step, added to an existing manifest or carried by a minimal new one. */
function ensureManifest(target: string, create: boolean): boolean {
  const path = join(target, 'package.json');

  if (create) {
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          name: basename(target).toLowerCase(),
          version: '0.0.0',
          private: true,
          scripts: { prepare: REAPPLY },
        },
        null,
        2,
      )}\n`,
    );
    return true;
  }

  const manifest = JSON.parse(readFileSync(path, 'utf-8'));
  const scripts = manifest.scripts ?? {};
  if (scripts.prepare && !String(scripts.prepare).includes('core.hooksPath')) {
    // Not overwritten: a prepare script the project already has is the project's.
    return false;
  }
  scripts.prepare = scripts.prepare ?? REAPPLY;
  manifest.scripts = scripts;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return true;
}
