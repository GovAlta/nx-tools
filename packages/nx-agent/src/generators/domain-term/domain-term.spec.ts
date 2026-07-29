import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './domain-term';

describe('nx-agent domain-term generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the term file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { term: 'Case' });

    const content = host.read('project-docs/domain-terms/case.md').toString();
    expect(content).toContain('term: Case');
    expect(content).toContain('aliases: []');
    expect(content).toContain('not_confused_with: []');
    expect(content).toContain('project-docs-ancestors: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/bounded-contexts/collision-reporting.md',
      ['---', 'name: Collision Reporting', '---'].join('\n'),
    );

    await generator(host, {
      term: 'Collision Report',
      projectDocsAncestors: [
        'project-docs/bounded-contexts/collision-reporting.md',
      ],
    });

    const content = host
      .read('project-docs/domain-terms/collision-report.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [bounded-contexts:collision-reporting]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        term: 'Collision Report',
        projectDocsAncestors: ['project-docs/bounded-contexts/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(host.exists('project-docs/domain-terms/collision-report.md')).toBe(
      false,
    );
    expect(host.exists('project-docs/domain-terms/README.md')).toBe(false);
  });

  it('derives the filename slug from a multi-word term', async () => {
    await generator(host, { term: 'Service Provider' });

    expect(host.exists('project-docs/domain-terms/service-provider.md')).toBe(
      true,
    );
  });

  it('creates the container README on first run', async () => {
    await generator(host, { term: 'Case' });

    const readme = host.read('project-docs/domain-terms/README.md').toString();
    expect(readme).toContain('# Domain terms');
    expect(readme).toContain('nx g @abgov/nx-agent:domain-term');
  });

  it('does not duplicate or alter the README when a second, different term is added', async () => {
    await generator(host, { term: 'Case' });
    const readmeBefore = host
      .read('project-docs/domain-terms/README.md')
      .toString();

    await generator(host, { term: 'File' });

    const readmeAfter = host
      .read('project-docs/domain-terms/README.md')
      .toString();
    expect(readmeAfter).toBe(readmeBefore);
    expect(host.exists('project-docs/domain-terms/case.md')).toBe(true);
    expect(host.exists('project-docs/domain-terms/file.md')).toBe(true);
  });

  it('throws and makes no changes when the term file already exists', async () => {
    await generator(host, { term: 'Case' });
    const before = host.read('project-docs/domain-terms/case.md').toString();

    await expect(generator(host, { term: 'Case' })).rejects.toThrow(
      /already exists/,
    );

    expect(host.read('project-docs/domain-terms/case.md').toString()).toBe(
      before,
    );
  });

  it('scopes the term file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, { term: 'Case', project: 'domain-lib' });

    expect(
      host.exists('libs/domain-lib/project-docs/domain-terms/case.md'),
    ).toBe(true);
    expect(host.exists('project-docs/domain-terms/case.md')).toBe(false);
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, { term: 'Case', project: 'domain-lib' });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/domain-terms/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { term: 'File' });

    const rootReadme = host
      .read('project-docs/domain-terms/README.md')
      .toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('instructs listing the directory before coining a new term', async () => {
    await generator(host, { term: 'Case' });

    const readme = host.read('project-docs/domain-terms/README.md').toString();
    expect(readme).toContain('listing this folder');
  });

  it('registers its own artifact-schema entry expecting a bounded-contexts ancestor', async () => {
    await generator(host, { term: 'Case' });

    expect(readArtifactSchema(host)).toEqual({
      'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
    });
  });

  it('--resolves writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/open-questions/what-to-call-this.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host, {
      term: 'Case',
      resolves: ['project-docs/open-questions/what-to-call-this.md'],
    });

    const content = host.read('project-docs/domain-terms/case.md').toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:what-to-call-this]',
    );
    expect(content).toContain('resolves: [open-questions:what-to-call-this]');
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this domain term resolves open-questions:what-to-call-this',
    );
    logSpy.mockRestore();
  });
});
