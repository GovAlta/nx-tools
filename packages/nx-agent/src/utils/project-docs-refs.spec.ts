import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { addProjectConfiguration, Tree } from '@nx/devkit';
import {
  buildIndex,
  buildRegistry,
  computeViolations,
  extractCommentAncestorRefs,
  extractFrontmatterAncestorRefs,
  getAncestors,
  getDescendants,
  parseAncestorRef,
  refKey,
  resolveRefFromPath,
} from './project-docs-refs';

describe('parseAncestorRef', () => {
  it('parses a bare collection reference', () => {
    expect(parseAncestorRef('domain-terms:collision-report')).toEqual({
      project: undefined,
      type: 'domain-terms',
      id: 'collision-report',
      fragment: undefined,
    });
  });

  it('parses a bare singular reference (no id)', () => {
    expect(parseAncestorRef('architecture-overview')).toEqual({
      project: undefined,
      type: 'architecture-overview',
      id: undefined,
      fragment: undefined,
    });
  });

  it('parses a project-qualified reference', () => {
    expect(parseAncestorRef('some-shared-lib/domain-terms:customer')).toEqual({
      project: 'some-shared-lib',
      type: 'domain-terms',
      id: 'customer',
      fragment: undefined,
    });
  });

  it('parses an optional fragment', () => {
    expect(
      parseAncestorRef('bounded-contexts:collision-reporting#status-lifecycle'),
    ).toEqual({
      project: undefined,
      type: 'bounded-contexts',
      id: 'collision-reporting',
      fragment: 'status-lifecycle',
    });
  });

  it('returns null for an empty or malformed token', () => {
    expect(parseAncestorRef('')).toBeNull();
    expect(parseAncestorRef('  ')).toBeNull();
    expect(parseAncestorRef('has a space')).toBeNull();
    expect(parseAncestorRef('too/many/slashes:id')).toBeNull();
  });
});

describe('refKey', () => {
  it('serializes with and without id/project', () => {
    expect(refKey({ type: 'domain-terms', id: 'customer' })).toBe(
      'domain-terms:customer',
    );
    expect(refKey({ type: 'architecture-overview' })).toBe(
      'architecture-overview',
    );
    expect(
      refKey({ project: 'lib', type: 'domain-terms', id: 'customer' }),
    ).toBe('lib/domain-terms:customer');
  });
});

describe('extractFrontmatterAncestorRefs', () => {
  it('reads an inline flow array', () => {
    const content = [
      '---',
      'term: Collision Report',
      'project-docs-ancestors: [bounded-contexts:collision-reporting]',
      '---',
    ].join('\n');
    expect(extractFrontmatterAncestorRefs(content)).toEqual([
      'bounded-contexts:collision-reporting',
    ]);
  });

  it('reads a block list', () => {
    const content = [
      '---',
      'term: Collision Report',
      'project-docs-ancestors:',
      '  - bounded-contexts:collision-reporting',
      '  - domain-terms:report',
      'aliases: []',
      '---',
    ].join('\n');
    expect(extractFrontmatterAncestorRefs(content)).toEqual([
      'bounded-contexts:collision-reporting',
      'domain-terms:report',
    ]);
  });

  it('returns an empty array when the key is missing', () => {
    const content = ['---', 'term: Collision Report', '---'].join('\n');
    expect(extractFrontmatterAncestorRefs(content)).toEqual([]);
  });

  it('returns an empty array when there is no frontmatter at all', () => {
    expect(extractFrontmatterAncestorRefs('just some text')).toEqual([]);
  });

  it('reads a multi-line flow array — the shape Prettier wraps a long inline array into', () => {
    const content = [
      '---',
      'name: Collision Report Lifecycle',
      'project-docs-ancestors:',
      '  [',
      '    bounded-contexts:collision-reporting,',
      '    domain-terms:collision-report,',
      '    domain-terms:report-status,',
      '    requirements:some-existing-requirement,',
      '  ]',
      '---',
    ].join('\n');
    expect(extractFrontmatterAncestorRefs(content)).toEqual([
      'bounded-contexts:collision-reporting',
      'domain-terms:collision-report',
      'domain-terms:report-status',
      'requirements:some-existing-requirement',
    ]);
  });

  it('returns an empty array rather than throwing on malformed YAML', () => {
    const content = ['---', 'not: [valid: yaml: at all', '---'].join('\n');
    expect(extractFrontmatterAncestorRefs(content)).toEqual([]);
  });

  it('returns an empty array when the key is present but not a list', () => {
    const content = ['---', 'project-docs-ancestors: not-a-list', '---'].join(
      '\n',
    );
    expect(extractFrontmatterAncestorRefs(content)).toEqual([]);
  });
});

describe('extractCommentAncestorRefs', () => {
  it('reads a comma-separated comment directive', () => {
    const content = [
      '// project-docs-ancestors: bounded-contexts:collision-reporting, domain-terms:report',
      'export function foo() {}',
    ].join('\n');
    expect(extractCommentAncestorRefs(content)).toEqual([
      'bounded-contexts:collision-reporting',
      'domain-terms:report',
    ]);
  });

  it('returns an empty array when absent', () => {
    expect(extractCommentAncestorRefs('export function foo() {}')).toEqual([]);
  });
});

describe('resolveRefFromPath', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('resolves a workspace-root collection artifact', () => {
    host.write('project-docs/domain-terms/collision-report.md', 'x');
    expect(
      resolveRefFromPath(host, 'project-docs/domain-terms/collision-report.md'),
    ).toBe('domain-terms:collision-report');
  });

  it('resolves a workspace-root singular artifact', () => {
    host.write('project-docs/architecture-overview.md', 'x');
    expect(
      resolveRefFromPath(host, 'project-docs/architecture-overview.md'),
    ).toBe('architecture-overview');
  });

  it('resolves and project-qualifies an artifact under a project root', () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });
    host.write('libs/domain-lib/project-docs/domain-terms/customer.md', 'x');
    expect(
      resolveRefFromPath(
        host,
        'libs/domain-lib/project-docs/domain-terms/customer.md',
      ),
    ).toBe('domain-lib/domain-terms:customer');
  });

  it('throws when the target does not exist', () => {
    expect(() =>
      resolveRefFromPath(host, 'project-docs/domain-terms/nope.md'),
    ).toThrow(/not found/);
  });

  it('throws when the path is not under a project-docs/ folder', () => {
    host.write('apps/test/src/main.ts', 'x');
    expect(() => resolveRefFromPath(host, 'apps/test/src/main.ts')).toThrow(
      /not under a project-docs/,
    );
  });

  it('throws when project-docs/ sits under an unknown root', () => {
    host.write('libs/unregistered/project-docs/domain-terms/x.md', 'x');
    expect(() =>
      resolveRefFromPath(
        host,
        'libs/unregistered/project-docs/domain-terms/x.md',
      ),
    ).toThrow(/known project root/);
  });
});

describe('buildRegistry / buildIndex / computeViolations', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('finds a correctly-resolved reference with no violations', () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      '// project-docs-ancestors: domain-terms:collision-report\nexport {};',
    );

    const registry = buildRegistry(host);
    const index = buildIndex(host);
    const violations = computeViolations(registry, index);

    expect(registry.has('domain-terms:collision-report')).toBe(true);
    expect(violations.brokenRefs).toEqual([]);
    expect(violations.orphans).toEqual([]);
  });

  it('flags a reference to a nonexistent artifact as broken', () => {
    host.write(
      'apps/test/src/routes/collision-reports.ts',
      '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
    );

    const violations = computeViolations(buildRegistry(host), buildIndex(host));

    expect(violations.brokenRefs).toEqual([
      {
        ref: 'domain-terms:typo-id',
        referencedFrom: 'apps/test/src/routes/collision-reports.ts',
      },
    ]);
  });

  it('flags an artifact nothing references as an orphan, without failing', () => {
    host.write(
      'project-docs/domain-terms/unused.md',
      ['---', 'term: Unused', '---'].join('\n'),
    );

    const violations = computeViolations(buildRegistry(host), buildIndex(host));

    expect(violations.orphans).toEqual(['domain-terms:unused']);
    expect(violations.brokenRefs).toEqual([]);
  });

  it('handles a multi-ref file deriving from more than one artifact', () => {
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---'].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/b.md',
      ['---', 'name: B', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: domain-terms:a, bounded-contexts:b\nexport {};',
    );

    const violations = computeViolations(buildRegistry(host), buildIndex(host));

    expect(violations.brokenRefs).toEqual([]);
    expect(violations.orphans).toEqual([]);
  });

  it("does not treat a type folder's own README.md as an artifact", () => {
    host.write('project-docs/domain-terms/README.md', '# Domain terms');

    const registry = buildRegistry(host);

    expect(registry.size).toBe(0);
  });

  it('defaults to no unscoped violations when no schema is passed', () => {
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---'].join('\n'),
    );

    const violations = computeViolations(buildRegistry(host), buildIndex(host));

    expect(violations.unscoped).toEqual([]);
  });

  it('flags an artifact missing an expected ancestor type as unscoped', () => {
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---'].join('\n'),
    );

    const violations = computeViolations(
      buildRegistry(host),
      buildIndex(host),
      {
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      },
    );

    expect(violations.unscoped).toEqual(['domain-terms:a']);
  });

  it('does not flag an artifact that has one of the expected ancestor types', () => {
    host.write(
      'project-docs/bounded-contexts/b.md',
      ['---', 'name: B', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-terms/a.md',
      [
        '---',
        'term: A',
        'project-docs-ancestors: [bounded-contexts:b]',
        '---',
      ].join('\n'),
    );

    const violations = computeViolations(
      buildRegistry(host),
      buildIndex(host),
      {
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      },
    );

    expect(violations.unscoped).toEqual([]);
  });

  it('does not check a type with no schema entry, or one with an empty expectation', () => {
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---'].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/b.md',
      ['---', 'name: B', '---'].join('\n'),
    );

    const violations = computeViolations(
      buildRegistry(host),
      buildIndex(host),
      {
        'bounded-contexts': { expectedAncestorTypes: [] },
      },
    );

    expect(violations.unscoped).toEqual([]);
  });

  it('flags an artifact with only some of several expected ancestor types (all-of, not any-of)', () => {
    host.write(
      'project-docs/bounded-contexts/b.md',
      ['---', 'name: B', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-models/m.md',
      [
        '---',
        'name: M',
        'project-docs-ancestors: [bounded-contexts:b]',
        '---',
      ].join('\n'),
    );

    const violations = computeViolations(
      buildRegistry(host),
      buildIndex(host),
      {
        'domain-models': {
          expectedAncestorTypes: ['bounded-contexts', 'domain-terms'],
        },
      },
    );

    expect(violations.unscoped).toEqual(['domain-models:m']);
  });

  it('does not flag an artifact that has all of several expected ancestor types', () => {
    host.write(
      'project-docs/bounded-contexts/b.md',
      ['---', 'name: B', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-models/m.md',
      [
        '---',
        'name: M',
        'project-docs-ancestors: [bounded-contexts:b, domain-terms:a]',
        '---',
      ].join('\n'),
    );

    const violations = computeViolations(
      buildRegistry(host),
      buildIndex(host),
      {
        'domain-models': {
          expectedAncestorTypes: ['bounded-contexts', 'domain-terms'],
        },
      },
    );

    expect(violations.unscoped).toEqual([]);
  });
});

describe('getAncestors', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('reads refs from a source file without needing a built graph', () => {
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: domain-terms:a, bounded-contexts:b\nexport {};',
    );

    expect(getAncestors(host, 'apps/test/src/main.ts')).toEqual([
      {
        project: undefined,
        type: 'domain-terms',
        id: 'a',
        fragment: undefined,
      },
      {
        project: undefined,
        type: 'bounded-contexts',
        id: 'b',
        fragment: undefined,
      },
    ]);
  });

  it("reads refs from an artifact's own frontmatter", () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      [
        '---',
        'term: Collision Report',
        'project-docs-ancestors: [bounded-contexts:collision-reporting]',
        '---',
      ].join('\n'),
    );

    expect(
      getAncestors(host, 'project-docs/domain-terms/collision-report.md'),
    ).toEqual([
      {
        project: undefined,
        type: 'bounded-contexts',
        id: 'collision-reporting',
        fragment: undefined,
      },
    ]);
  });

  it('returns an empty array for a file with no references', () => {
    host.write('apps/test/src/main.ts', 'export {};');
    expect(getAncestors(host, 'apps/test/src/main.ts')).toEqual([]);
  });

  it('throws for a nonexistent file rather than silently returning nothing', () => {
    expect(() => getAncestors(host, 'apps/test/src/nope.ts')).toThrow(
      /no such file/,
    );
  });

  it('defaults to direct references only (depth 1)', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      [
        '---',
        'term: B',
        'project-docs-ancestors: [bounded-contexts:c]',
        '---',
      ].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: domain-terms:b\nexport {};',
    );

    expect(getAncestors(host, 'apps/test/src/main.ts')).toEqual([
      {
        project: undefined,
        type: 'domain-terms',
        id: 'b',
        fragment: undefined,
      },
    ]);
  });

  it('walks multiple hops when depth > 1', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      [
        '---',
        'term: B',
        'project-docs-ancestors: [bounded-contexts:c]',
        '---',
      ].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/c.md',
      ['---', 'name: C', '---'].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: domain-terms:b\nexport {};',
    );

    expect(
      getAncestors(host, 'apps/test/src/main.ts', 2).map(refKey).sort(),
    ).toEqual(['bounded-contexts:c', 'domain-terms:b']);
  });

  it('terminates on a cycle when depth is Infinity, without duplicates', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      [
        '---',
        'term: B',
        'project-docs-ancestors: [bounded-contexts:c]',
        '---',
      ].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/c.md',
      [
        '---',
        'name: C',
        'project-docs-ancestors: [domain-terms:b]',
        '---',
      ].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: domain-terms:b\nexport {};',
    );

    expect(
      getAncestors(host, 'apps/test/src/main.ts', Infinity).map(refKey).sort(),
    ).toEqual(['bounded-contexts:c', 'domain-terms:b']);
  });
});

describe('getDescendants', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('finds every file referencing a given artifact', () => {
    host.write(
      'apps/a/src/main.ts',
      '// project-docs-ancestors: domain-terms:collision-report\nexport {};',
    );
    host.write(
      'apps/b/src/main.ts',
      '// project-docs-ancestors: domain-terms:collision-report\nexport {};',
    );

    const referrers = getDescendants(host, 'domain-terms:collision-report');

    expect(referrers.map((r) => r.file).sort()).toEqual([
      'apps/a/src/main.ts',
      'apps/b/src/main.ts',
    ]);
  });

  it('returns an empty array when nothing references the given key', () => {
    expect(getDescendants(host, 'domain-terms:nothing-points-here')).toEqual(
      [],
    );
  });

  it('defaults to direct referrers only (depth 1)', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      ['---', 'term: B', '---'].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/c.md',
      [
        '---',
        'name: C',
        'project-docs-ancestors: [domain-terms:b]',
        '---',
      ].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: bounded-contexts:c\nexport {};',
    );

    expect(getDescendants(host, 'domain-terms:b').map((e) => e.file)).toEqual([
      'project-docs/bounded-contexts/c.md',
    ]);
  });

  it('walks multiple hops when depth > 1, following referrers that are themselves registered artifacts', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      ['---', 'term: B', '---'].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/c.md',
      [
        '---',
        'name: C',
        'project-docs-ancestors: [domain-terms:b]',
        '---',
      ].join('\n'),
    );
    host.write(
      'apps/test/src/main.ts',
      '// project-docs-ancestors: bounded-contexts:c\nexport {};',
    );

    expect(
      getDescendants(host, 'domain-terms:b', 2)
        .map((e) => e.file)
        .sort(),
    ).toEqual(['apps/test/src/main.ts', 'project-docs/bounded-contexts/c.md']);
  });

  it('terminates on a cycle when depth is Infinity, without duplicates', () => {
    host.write(
      'project-docs/domain-terms/b.md',
      [
        '---',
        'term: B',
        'project-docs-ancestors: [bounded-contexts:c]',
        '---',
      ].join('\n'),
    );
    host.write(
      'project-docs/bounded-contexts/c.md',
      [
        '---',
        'name: C',
        'project-docs-ancestors: [domain-terms:b]',
        '---',
      ].join('\n'),
    );

    expect(
      getDescendants(host, 'domain-terms:b', Infinity)
        .map((e) => e.file)
        .sort(),
    ).toEqual([
      'project-docs/bounded-contexts/c.md',
      'project-docs/domain-terms/b.md',
    ]);
  });
});
