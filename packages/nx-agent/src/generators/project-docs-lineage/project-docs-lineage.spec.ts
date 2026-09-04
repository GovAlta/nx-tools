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

  it('reports an unreferenced artifact without throwing', async () => {
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
  describe('schemaVersion and --json', () => {
    // A minimal graph with one resolving reference and one broken one, so both
    // halves of the payload are non-empty in the assertions below.
    function seedGraph(host: Tree) {
      host.write(
        'project-docs/domain-terms/collision-report.md',
        ['---', 'term: Collision Report', '---'].join('\n'),
      );
      host.write(
        'apps/test/src/routes/collision-reports.ts',
        '// project-docs-ancestors: domain-terms:collision-report\nexport {};',
      );
    }

    it('declares a schemaVersion in the written graph', async () => {
      seedGraph(host);

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.schemaVersion).toBe(1);
    });

    it('prints the graph to stdout as one parseable document with --json', async () => {
      seedGraph(host);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await generator(host, { json: true });

      const printed = logSpy.mock.calls.map((c) => c[0]);
      expect(printed).toHaveLength(1);
      const streamed = JSON.parse(printed[0]);
      expect(streamed.schemaVersion).toBe(1);
      expect(streamed.registry['domain-terms:collision-report']).toBeDefined();
      logSpy.mockRestore();
    });

    it('streams exactly what it writes, so the two surfaces cannot diverge', async () => {
      seedGraph(host);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await generator(host, { json: true });

      const streamed = JSON.parse(logSpy.mock.calls[0][0]);
      const written = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(streamed).toEqual(written);
      logSpy.mockRestore();
    });

    it('suppresses the human-readable summary under --json', async () => {
      host.write(
        'apps/test/src/routes/collision-reports.ts',
        '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await generator(host, { json: true });

      const printed = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(printed).not.toContain('[nx-agent]');
      expect(JSON.parse(printed).violations.brokenRefs).toHaveLength(1);
      logSpy.mockRestore();
    });

    // The reason --json exists: --strict alone rolls its own write back, so a
    // gate could have the exit code or the graph but never both in one run.
    it('prints the graph before --strict throws, so a gate gets both', async () => {
      host.write(
        'apps/test/src/routes/collision-reports.ts',
        '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(
        generator(host, { json: true, strict: true }),
      ).rejects.toThrow(/broken project-docs-ancestors reference/);

      const streamed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(streamed.violations.brokenRefs).toHaveLength(1);
      logSpy.mockRestore();
    });
  });

  describe('integrity and status containers', () => {
    it('splits findings into integrity and status', async () => {
      host.write(
        'apps/test/src/routes/collision-reports.ts',
        '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(Object.keys(lineage.integrity).sort()).toEqual([
        'brokenRefs',
        'cycles',
        'schemaErrors',
        'unparseableRefs',
        'yamlErrors',
      ]);
      expect(Object.keys(lineage.status).sort()).toEqual([
        'resolution',
        'unreferenced',
        'unscoped',
      ]);
      expect(lineage.integrity.brokenRefs).toHaveLength(1);
    });

    // The deprecated alias exists only so an existing workspace's
    // write-if-missing script keeps working; it must never be a second source
    // of truth, so it's built from the same arrays rather than recomputed.
    it('keeps a deprecated violations alias carrying identical data', async () => {
      host.write(
        'project-docs/domain-terms/unused.md',
        ['---', 'term: Unused', '---'].join('\n'),
      );
      host.write(
        'apps/test/src/routes/collision-reports.ts',
        '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
      );

      await generator(host);

      const l = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(l.violations.brokenRefs).toEqual(l.integrity.brokenRefs);
      expect(l.violations.unparseableRefs).toEqual(l.integrity.unparseableRefs);
      expect(l.violations.yamlErrors).toEqual(l.integrity.yamlErrors);
      expect(l.violations.orphans).toEqual(l.status.unreferenced);
      expect(l.violations.unscoped).toEqual(l.status.unscoped);
      expect(l.violations.resolutionStatus).toEqual(l.status.resolution);
    });

    // The whole point of the split: --strict is a validity check on the graph,
    // so a sound graph reporting incomplete work must not fail it.
    it('does not fail --strict on a status-only finding', async () => {
      host.write(
        'project-docs/domain-terms/unused.md',
        ['---', 'term: Unused', '---'].join('\n'),
      );

      await expect(generator(host, { strict: true })).resolves.toBeUndefined();

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.status.unreferenced).toEqual(['domain-terms:unused']);
      expect(lineage.integrity.brokenRefs).toEqual([]);
    });
  });

  describe('cycles', () => {
    function writeMutualPair(host: Tree) {
      host.write(
        'project-docs/domain-terms/a.md',
        [
          '---',
          'term: A',
          'project-docs-ancestors:',
          '  - domain-terms:b',
          '---',
        ].join('\n'),
      );
      host.write(
        'project-docs/domain-terms/b.md',
        [
          '---',
          'term: B',
          'project-docs-ancestors:',
          '  - domain-terms:a',
          '---',
        ].join('\n'),
      );
    }

    it('reports two artifacts deriving from each other', async () => {
      writeMutualPair(host);

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.cycles).toEqual([
        ['domain-terms:a', 'domain-terms:b'],
      ]);
    });

    // Reachable from either member, so without canonicalisation the same loop
    // would be reported once per node in it.
    it('reports a cycle once, not once per member', async () => {
      writeMutualPair(host);

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.cycles).toHaveLength(1);
    });

    it('reports an artifact naming itself as its own ancestor', async () => {
      host.write(
        'project-docs/domain-terms/self.md',
        [
          '---',
          'term: Self',
          'project-docs-ancestors:',
          '  - domain-terms:self',
          '---',
        ].join('\n'),
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.cycles).toEqual([['domain-terms:self']]);
    });

    it('fails --strict on a cycle, since the graph is contradictory', async () => {
      writeMutualPair(host);

      await expect(generator(host, { strict: true })).rejects.toThrow(
        /reference cycle/,
      );
    });

    it('does not mistake a diamond for a cycle', async () => {
      host.write(
        'project-docs/domain-terms/root.md',
        ['---', 'term: Root', '---'].join('\n'),
      );
      for (const side of ['left', 'right']) {
        host.write(
          `project-docs/domain-terms/${side}.md`,
          [
            '---',
            `term: ${side}`,
            'project-docs-ancestors:',
            '  - domain-terms:root',
            '---',
          ].join('\n'),
        );
      }
      host.write(
        'project-docs/domain-terms/join.md',
        [
          '---',
          'term: Join',
          'project-docs-ancestors:',
          '  - domain-terms:left',
          '  - domain-terms:right',
          '---',
        ].join('\n'),
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.cycles).toEqual([]);
    });
  });

  describe('schemaErrors', () => {
    it('catches a singular expectedAncestorTypes value and names the fix', async () => {
      host.write(
        'project-docs/bounded-contexts/bc.md',
        ['---', 'name: BC', '---'].join('\n'),
      );
      host.write(
        'project-docs/domain-terms/a.md',
        ['---', 'term: A', '---'].join('\n'),
      );
      host.write(
        'project-docs/artifact-schema.json',
        JSON.stringify({
          'bounded-contexts': { expectedAncestorTypes: [] },
          // The slip: singular, where every real type name is plural.
          'domain-terms': { expectedAncestorTypes: ['bounded-context'] },
        }),
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.schemaErrors).toEqual([
        {
          type: 'domain-terms',
          expectedAncestorType: 'bounded-context',
          didYouMean: 'bounded-contexts',
        },
      ]);
    });

    // The defect this fixes: one bad schema value made every artifact of its
    // type report unscoped, pointing at artifacts that are correct.
    it('does not also report every artifact of that type as unscoped', async () => {
      host.write(
        'project-docs/bounded-contexts/bc.md',
        ['---', 'name: BC', '---'].join('\n'),
      );
      host.write(
        'project-docs/domain-terms/a.md',
        ['---', 'term: A', '---'].join('\n'),
      );
      host.write(
        'project-docs/artifact-schema.json',
        JSON.stringify({
          'bounded-contexts': { expectedAncestorTypes: [] },
          'domain-terms': { expectedAncestorTypes: ['bounded-context'] },
        }),
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.status.unscoped).toEqual([]);
    });

    // A type nothing has been written for yet is indistinguishable from a
    // misspelling, so it must not be flagged — that would fail --strict on a
    // correct schema, and in a fresh workspace on most of it.
    it('stays silent on an unknown type that is not a near-miss', async () => {
      host.write(
        'project-docs/domain-terms/a.md',
        ['---', 'term: A', '---'].join('\n'),
      );
      host.write(
        'project-docs/artifact-schema.json',
        JSON.stringify({
          'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
        }),
      );

      await generator(host);

      const lineage = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
      expect(lineage.integrity.schemaErrors).toEqual([]);
      // Still checked, because the expectation may yet be satisfiable.
      expect(lineage.status.unscoped).toEqual(['domain-terms:a']);
    });

    it('fails --strict on a misspelled expectation', async () => {
      host.write(
        'project-docs/bounded-contexts/bc.md',
        ['---', 'name: BC', '---'].join('\n'),
      );
      host.write(
        'project-docs/artifact-schema.json',
        JSON.stringify({
          'bounded-contexts': { expectedAncestorTypes: [] },
          'domain-terms': { expectedAncestorTypes: ['bounded-context'] },
        }),
      );

      await expect(generator(host, { strict: true })).rejects.toThrow(
        /misspelled expectedAncestorTypes/,
      );
    });
  });
});
