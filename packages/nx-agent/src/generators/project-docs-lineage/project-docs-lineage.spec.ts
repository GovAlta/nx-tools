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
    expect(lineage.violations.unscoped).toEqual([]);
  });

  it('throws and lists every broken reference when one is found, with --strict', async () => {
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
    );

    await expect(generator(host, { strict: true })).rejects.toThrow(/1 broken/);
  });

  // The whole point of recording rather than aborting: a consumer reading the
  // file has to be able to tell "one known gap" from "no data at all".
  it('still writes the graph, with the broken reference recorded, by default', async () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      [
        '// project-docs-ancestors: domain-terms:collision-report, domain-terms:typo-id',
        'export {};',
      ].join('\n'),
    );

    await expect(generator(host)).resolves.toBeUndefined();

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.brokenRefs).toEqual([
      {
        ref: 'domain-terms:typo-id',
        referencedFrom: 'apps/test/src/routes/collision-reports.ts',
      },
    ]);
    // Everything unrelated to the broken reference survives — that's the fact
    // aborting the write used to destroy.
    expect(lineage.registry['domain-terms:collision-report']).toBeDefined();
    expect(lineage.violations.orphans).toEqual([]);
  });

  it('throws on a YAML parse error with --strict, and records it by default', async () => {
    host.write(
      'project-docs/domain-terms/malformed.md',
      ['---', 'term: Malformed', '  bad: indentation', '---'].join('\n'),
    );
    jest.spyOn(console, 'log').mockImplementation();

    await expect(generator(host, { strict: true })).rejects.toThrow(
      /YAML parse error/,
    );

    await expect(generator(host)).resolves.toBeUndefined();
    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.yamlErrors).toHaveLength(1);
    expect(lineage.violations.yamlErrors[0].path).toBe(
      'project-docs/domain-terms/malformed.md',
    );
    jest.restoreAllMocks();
  });

  // The reported case end to end: an artifact whose title carried a version
  // number, referenced from code. Both the reference and the artifact's own key
  // are unreadable to the grammar, and both used to vanish without a word.
  it('records an unparseable reference in the graph, and blocks on it with --strict', async () => {
    host.write(
      'project-docs/open-questions/otel-1.23.0.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/telemetry.ts',
      '// project-docs-ancestors: open-questions:otel-1.23.0\nexport {};',
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await expect(generator(host)).resolves.toBeUndefined();

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.unparseableRefs).toEqual([
      {
        ref: 'open-questions:otel-1.23.0',
        foundIn: 'project-docs/open-questions/otel-1.23.0.md',
      },
      {
        ref: 'open-questions:otel-1.23.0',
        foundIn: 'apps/test/src/telemetry.ts',
      },
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'unparseable reference "open-questions:otel-1.23.0"',
      ),
    );
    logSpy.mockRestore();

    await expect(generator(host, { strict: true })).rejects.toThrow(
      /2 unparseable/,
    );
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

  it('reports an unscoped artifact without throwing, when artifact-schema.json expects an ancestor', async () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      }),
    );
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );

    await expect(generator(host)).resolves.toBeUndefined();

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.unscoped).toEqual([
      'domain-terms:collision-report',
    ]);
  });

  it('does not flag an artifact that has the expected ancestor type', async () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      }),
    );
    host.write(
      'project-docs/bounded-contexts/collision-reporting.md',
      ['---', 'name: Collision Reporting', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-terms/collision-report.md',
      [
        '---',
        'term: Collision Report',
        'project-docs-ancestors: [bounded-contexts:collision-reporting]',
        '---',
      ].join('\n'),
    );

    await generator(host);

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.unscoped).toEqual([]);
  });

  it('behaves exactly as today when artifact-schema.json is absent', async () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );

    await generator(host);

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.unscoped).toEqual([]);
  });

  it('reports resolutionStatus without throwing, console-logging open and resolved keys', async () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        'open-questions': { expectedAncestorTypes: [], tracksResolution: true },
      }),
    );
    host.write(
      'project-docs/open-questions/still-open.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    host.write(
      'project-docs/open-questions/resolved-one.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-models/m.md',
      [
        '---',
        'name: M',
        'project-docs-ancestors: [open-questions:resolved-one]',
        'resolves: [open-questions:resolved-one]',
        '---',
      ].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await expect(generator(host)).resolves.toBeUndefined();

    const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(lineage.violations.resolutionStatus.open).toEqual([
      'open-questions:still-open',
    ]);
    expect(lineage.violations.resolutionStatus.resolved).toEqual([
      'open-questions:resolved-one',
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      '[nx-agent] open (unresolved): open-questions:still-open',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[nx-agent] resolved: open-questions:resolved-one',
    );
    logSpy.mockRestore();
  });
});
