// project-docs-ancestors: cli-designs:keystone-init

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { redact } from '../core/redact';
import { ResolvedSource, SOURCE_LAYOUT } from './source';

export interface UpgradeOutcome {
  readonly status: number;
  readonly output: string;
}

/**
 * Hand an existing copy to the harness's own upgrade tool.
 *
 * Placing into an empty tree is the case the harness declines; merging into a tree that already
 * has one is the case it solves, in a large and carefully-reasoned tool whose rules about what a
 * project keeps are declared alongside the content itself. Reimplementing any of that here would
 * put a second opinion about what a project owns in a different repository from the declaration it
 * came from.
 *
 * SPAWNED as a process, not imported: what runs is the source's program, and its exit status is
 * the answer. This package contributes the spawn and a faithful relay — no merge logic, no view of
 * its own about what survives, and no default of its own about planning versus applying, which is
 * read from the tool by passing the caller's intent straight through.
 */
export function runUpgradeTool(
  source: ResolvedSource,
  target: string,
  options: { apply?: boolean; json?: boolean } = {},
): UpgradeOutcome {
  const tool = join(source.root, SOURCE_LAYOUT.upgradeTool);
  const args = [tool, '--target', target];
  if (options.apply) {
    args.push('--apply');
  }
  if (options.json) {
    args.push('--json');
  }

  const result = spawnSync('node', args, {
    cwd: source.root, // the tool runs in the SOURCE and names the target
    encoding: 'utf-8',
  });

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    status: result.status ?? 1,
    // Redacted on the way out for the same reason every other relay is: this package holds no
    // credential, but a program it spawns can echo one it was given.
    output: redact(output),
  };
}

export function hasUpgradeTool(source: ResolvedSource): boolean {
  return existsSync(join(source.root, SOURCE_LAYOUT.upgradeTool));
}
