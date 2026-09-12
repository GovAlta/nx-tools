// project-docs-ancestors: cli-designs:keystone-init

import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { hasUpgradeTool, runUpgradeTool } from './upgrade';
import { resolveSource, SOURCE_LAYOUT } from './source';
import { makeSource, makeTarget } from '../testing/fixture';

// A real spawn of a real program. The point of this requirement is that the SOURCE's tool does the
// work, so mocking the spawn would test the opposite of the claim.

jest.setTimeout(120000);

/** A stand-in upgrade tool that reports what it was given and exits how it is told. */
function installTool(sourceRoot: string, exitCode: number, extra = ''): void {
  const path = join(sourceRoot, SOURCE_LAYOUT.upgradeTool);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      '#!/usr/bin/env node',
      'const args = process.argv.slice(2);',
      `console.log('TOOL RAN cwd=' + process.cwd() + ' args=' + args.join(' '));`,
      extra,
      `process.exit(${exitCode});`,
    ].join('\n'),
  );
  chmodSync(path, 0o755);
}

describe('runUpgradeTool', () => {
  // req-007 rule 1: the source's own tool performs the work, spawned, with the target named.
  it("spawns the source's tool in the source, naming the target", async () => {
    const sourceRoot = makeSource();
    installTool(sourceRoot, 0);
    const source = await resolveSource(sourceRoot);
    const target = makeTarget();

    const outcome = runUpgradeTool(source, target);

    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain('TOOL RAN');
    expect(outcome.output).toContain(`--target ${target}`);
    // It runs IN the source and names the target, which is the precondition the harness documents.
    // Compared as realpaths: process.cwd() resolves symlinks, and on macOS the temp root is one.
    expect(outcome.output).toContain(`cwd=${realpathSync(sourceRoot)}`);
  });

  // req-007 rule 6: the plan-versus-apply default is the tool's, passed through rather than
  // restated — so a mistyped flag cannot read as a completed upgrade.
  it('passes the caller intent through rather than deciding it', async () => {
    const sourceRoot = makeSource();
    installTool(sourceRoot, 0);
    const source = await resolveSource(sourceRoot);

    expect(runUpgradeTool(source, makeTarget()).output).not.toContain(
      '--apply',
    );
    expect(
      runUpgradeTool(source, makeTarget(), { apply: true }).output,
    ).toContain('--apply');
  });

  // req-007 rule 3: a refusal is the tool's, and it surfaces as one.
  it('reports the tool refusing, with its own status', async () => {
    const sourceRoot = makeSource();
    installTool(
      sourceRoot,
      2,
      `console.error('refused: nothing was written');`,
    );
    const source = await resolveSource(sourceRoot);

    const outcome = runUpgradeTool(source, makeTarget());

    expect(outcome.status).toBe(2);
    expect(outcome.output).toContain('refused: nothing was written');
  });

  it('redacts what it relays, since a spawned program can echo a credential it was given', async () => {
    const sourceRoot = makeSource();
    const fake = ['NOT', 'A', 'REAL', 'TOKEN'].join('_');
    installTool(
      sourceRoot,
      1,
      `console.error('failed https://u:' + '${fake}' + '@github.com/o/r');`,
    );
    const source = await resolveSource(sourceRoot);

    const outcome = runUpgradeTool(source, makeTarget());

    expect(outcome.output).not.toContain(fake);
    expect(outcome.output).toContain('<redacted>');
  });

  it('reports whether the source carries a tool at all', async () => {
    const withoutTool = await resolveSource(makeSource());
    expect(hasUpgradeTool(withoutTool)).toBe(false);

    const sourceRoot = makeSource();
    installTool(sourceRoot, 0);
    expect(hasUpgradeTool(await resolveSource(sourceRoot))).toBe(true);
  });
});
