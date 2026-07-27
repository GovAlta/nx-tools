import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import generator from './project-docs-lineage';

describe('nx-agent project-docs-lineage generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('writes the graph with zero violations when every reference resolves', async () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      '// project-docs-ancestors: domain-terms:collision-report\nexport {};',
    );

    await generator(host);

    expect(host.exists('.nx-agent/lineage.json')).toBe(true);
    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.registry['domain-terms:collision-report']).toBeDefined();
    expect(lineage.violations.brokenRefs).toEqual([]);
    expect(lineage.violations.orphans).toEqual([]);
  });

  it('throws and lists every broken reference when one is found', async () => {
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
    );

    await expect(generator(host)).rejects.toThrow(/1 broken/);
  });

  it('reports an orphan without throwing', async () => {
    host.write(
      'project-docs/domain-terms/unused.md',
      ['---', 'term: Unused', '---'].join('\n'),
    );

    await expect(generator(host)).resolves.toBeUndefined();

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.orphans).toEqual(['domain-terms:unused']);
  });
});
