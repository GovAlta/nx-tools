// project-docs-ancestors: cli-designs:keystone-init

import { existsSync } from 'fs';
import { join } from 'path';
import { git } from './git';

export interface WireResult {
  readonly gitInitialised: boolean;
}

/**
 * Initialise a git repository in the target if one does not already exist.
 *
 * Hook-path wiring is intentionally absent: that is owned by `@abgov/nx-agent:init`, which the
 * operator runs before this installer for Nx workspaces. The installer no longer spawns it — that
 * was a single-responsibility violation, and its fallback (writing `git config core.hooksPath`)
 * used a hardcoded value that rejected the value Husky v9 actually sets.
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
  return { gitInitialised };
}
