import { addProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './project-docs-report';

// The synthesis cascade itself is unit-tested in synthesis.spec.ts — here,
// child_process is mocked to always behave as "nothing on PATH" so this
// suite stays hermetic and exercises the deterministic fallback regardless
// of what's actually installed in the environment running the tests.
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(() => {
    throw new Error('not found');
  }),
  execFileSync: jest.fn(),
}));

describe('nx-agent project-docs-report generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('writes a self-contained HTML report with status, graph, and table content', async () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        'open-questions': {
          expectedAncestorTypes: [],
          tracksResolution: true,
        },
        'iteration-retrospectives': {
          expectedAncestorTypes: [],
          terminal: true,
        },
      }),
    );
    host.write(
      'project-docs/iteration-retrospectives/closed-out.md',
      [
        '---',
        'title: Closed Out',
        'project-docs-ancestors: []',
        'resolves: []',
        '---',
      ].join('\n'),
    );
    host.write(
      'project-docs/open-questions/still-open.md',
      [
        '---',
        'project-docs-ancestors: []',
        'resolves: []',
        '---',
        '',
        'Why this is still undecided.',
      ].join('\n'),
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
    host.write(
      'project-docs/domain-terms/unused.md',
      ['---', 'term: Unused', '---'].join('\n'),
    );
    // References both m and still-open, so neither is left as an orphan —
    // isolates domain-terms:unused as the one deliberate orphan.
    host.write(
      'src/feature.ts',
      '// project-docs-ancestors: domain-models:m, open-questions:still-open\nexport {};',
    );
    host.write(
      'src/broken.ts',
      '// project-docs-ancestors: domain-terms:typo-id\nexport {};',
    );

    await expect(
      generator(host, { noSynthesis: true }),
    ).resolves.toBeUndefined();

    expect(host.exists('project-docs/report.html')).toBe(true);
    const html = host.read('project-docs/report.html', 'utf-8');

    // status counts
    expect(html).toContain(
      '<div class="count">1</div><div class="label">Resolved</div>',
    );
    expect(html).toContain(
      '<div class="count">1</div><div class="label">Open</div>',
    );
    // domain-terms:unused is the only real orphan — iteration-retrospectives:
    // closed-out has zero descendants too, but is terminal, so it must not
    // inflate this count.
    expect(html).toContain(
      '<div class="count">1</div><div class="label">Orphaned</div>',
    );
    expect(html).toContain(
      '<div class="count">1</div><div class="label">Broken references</div>',
    );

    // every artifact's key appears somewhere in the report
    expect(html).toContain('open-questions:still-open');
    expect(html).toContain('open-questions:resolved-one');
    expect(html).toContain('domain-models:m');
    expect(html).toContain('domain-terms:unused');

    // broken ref surfaced without throwing
    expect(html).toContain('domain-terms:typo-id');
    expect(html).toContain('Broken references');

    // graph present
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('flowchart TD');
    expect(html).toContain('mermaid.initialize');

    // a terminal artifact (zero descendants by design) gets its own distinct
    // graph style and table badge, rather than looking like a plain orphan
    expect(html).toContain(
      '✓ iteration-retrospectives:closed-out&quot;]:::terminal',
    );
    expect(html).toContain(
      '<span class="badge badge-terminal">Closed out</span>',
    );
    expect(html).toContain('Closed out (terminal)');

    // deterministic fallback, with its explicit note
    expect(html).toContain(
      'LLM synthesis unavailable in this environment — showing computed summary.',
    );
    expect(html).toContain('project-docs artifact(s) tracked');

    // each artifact's own content is navigable in place: a table link and a
    // graph click directive both point at the same anchor, which holds its
    // markdown body rendered to real HTML (not raw markdown source)
    expect(html).toContain(
      '<td><a href="#artifact-open-questions-still-open">open-questions:still-open</a></td>',
    );
    expect(html).toMatch(
      /click n\d+ &quot;#artifact-open-questions-still-open&quot; &quot;View content&quot;/,
    );
    expect(html).toContain('<div id="artifact-open-questions-still-open"');
    // rendered from markdown to a real <p>, not dumped as raw source text
    expect(html).toContain('<p>Why this is still undecided.</p>');
  });

  it('is excluded from version control via the resolved output path', async () => {
    await generator(host, { noSynthesis: true });

    const gitignore = host.read('.gitignore', 'utf-8');
    expect(gitignore).toContain('project-docs/report.html');
  });

  it('falls back to the deterministic summary even without --noSynthesis, when nothing is on PATH', async () => {
    await generator(host, {});
    const html = host.read('project-docs/report.html', 'utf-8');
    expect(html).toContain(
      'LLM synthesis unavailable in this environment — showing computed summary.',
    );
  });

  describe('--project scoping', () => {
    beforeEach(() => {
      addProjectConfiguration(host, 'billing', {
        root: 'apps/billing',
        projectType: 'application',
      });
      addProjectConfiguration(host, 'shipping', {
        root: 'apps/shipping',
        projectType: 'application',
      });

      // Workspace-level term, ancestor of billing's own bounded context.
      host.write(
        'project-docs/domain-terms/money.md',
        ['---', 'term: Money', '---'].join('\n'),
      );
      host.write(
        'apps/billing/project-docs/bounded-contexts/invoicing.md',
        [
          '---',
          'name: Invoicing',
          'project-docs-ancestors: [domain-terms:money]',
          '---',
        ].join('\n'),
      );
      // A different project's artifact citing billing's bounded context —
      // the reference that must not be lost when the report is scoped to
      // billing alone.
      host.write(
        'apps/shipping/project-docs/domain-terms/shipment.md',
        [
          '---',
          'term: Shipment',
          'project-docs-ancestors: [billing/bounded-contexts:invoicing]',
          '---',
        ].join('\n'),
      );
    });

    it("writes the report under the scoped project's own project-docs/", async () => {
      await generator(host, { project: 'billing', noSynthesis: true });
      expect(host.exists('apps/billing/project-docs/report.html')).toBe(true);
      expect(host.exists('project-docs/report.html')).toBe(false);
    });

    it("includes only the scoped project's artifacts in the table, with out-of-scope ancestors shown only in the graph", async () => {
      await generator(host, { project: 'billing', noSynthesis: true });
      const html = host.read('apps/billing/project-docs/report.html', 'utf-8');

      // in-scope artifact: full table row (its own key, linked to its detail
      // anchor, as the row's first cell) + graph node
      expect(html).toContain(
        '<tr>\n        <td><a href="#artifact-billing-bounded-contexts-invoicing">billing/bounded-contexts:invoicing</a></td>',
      );

      // workspace-level ancestor: graph node (context) + listed as an
      // ancestor in invoicing's own row, but never its own table row. The
      // flowchart text is HTML-escaped when embedded, so `"` -> `&quot;`.
      expect(html).toContain('n1[&quot;domain-terms:money&quot;]:::context');
      expect(html).not.toContain(
        '<td><a href="#artifact-domain-terms-money">domain-terms:money</a></td>',
      );

      // a different project's unrelated artifact appears nowhere at all
      expect(html).not.toContain('shipping/domain-terms:shipment');
    });

    it('does not misclassify a cross-project reference as an orphan', async () => {
      await generator(host, { project: 'billing', noSynthesis: true });
      const html = host.read('apps/billing/project-docs/report.html', 'utf-8');

      // billing/bounded-contexts:invoicing IS referenced — from shipping,
      // outside the billing scope — so a report that (incorrectly) built
      // its violations only from billing's own files would flag it as an
      // orphan. Computing violations workspace-wide first prevents that.
      expect(html).toContain(
        '<div class="count">0</div><div class="label">Orphaned</div>',
      );
    });
  });
});
