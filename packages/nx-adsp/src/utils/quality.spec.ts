import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { addJestCoverageConfig } from './quality';

function makeConfig(coverageDirectoryLine: string): string {
  return [
    'module.exports = {',
    "  displayName: 'svc',",
    "  preset: '../../jest.preset.js',",
    `  ${coverageDirectoryLine}`,
    '};',
    '',
  ].join('\n');
}

// Parse the exported object literal; throws SyntaxError if the config is invalid
// (e.g. a property with no separating comma).
function evalConfigObject(src: string): Record<string, unknown> {
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  return new Function(`return (${body})`)() as Record<string, unknown>;
}

describe('addJestCoverageConfig', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('inserts a comma when coverageDirectory is the last property (no trailing comma)', () => {
    // The @nx/jest (Nx 23) template leaves coverageDirectory without a trailing comma.
    tree.write(
      'apps/svc/jest.config.cts',
      makeConfig("coverageDirectory: 'test-output/jest/coverage'")
    );

    addJestCoverageConfig(tree, 'apps/svc');
    const out = tree.read('apps/svc/jest.config.cts').toString();

    expect(out).toContain("coverageDirectory: 'test-output/jest/coverage',");
    expect(out).toContain('collectCoverage: true,');
    expect(out).toContain('lines: 60,');
    expect(out).not.toContain(',,');
    // The result must be a valid object literal.
    const cfg = evalConfigObject(out);
    expect(cfg.collectCoverage).toBe(true);
    expect((cfg.coverageThreshold as { global: { lines: number } }).global.lines).toBe(60);
  });

  it('does not double the comma when coverageDirectory already has one', () => {
    tree.write(
      'apps/svc/jest.config.cts',
      makeConfig("coverageDirectory: '../../coverage/svc',")
    );

    addJestCoverageConfig(tree, 'apps/svc');
    const out = tree.read('apps/svc/jest.config.cts').toString();

    expect(out).toContain("coverageDirectory: '../../coverage/svc',");
    expect(out).not.toContain(',,');
    expect(() => evalConfigObject(out)).not.toThrow();
  });

  it('is a no-op when there is no jest config', () => {
    expect(() => addJestCoverageConfig(tree, 'apps/none')).not.toThrow();
    expect(tree.exists('apps/none/jest.config.cts')).toBe(false);
  });
});
