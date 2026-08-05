import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './domain-model';

jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  formatFiles: jest.fn().mockResolvedValue(undefined),
}));

describe('nx-agent domain-model generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the model file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { name: 'Collision Report Lifecycle' });

    const content = host
      .read('project-docs/domain-models/collision-report-lifecycle.md')
      .toString();
    expect(content).toContain('name: Collision Report Lifecycle');
    expect(content).toContain('project-docs-ancestors: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/bounded-contexts/collision-reporting.md',
      ['---', 'name: Collision Reporting', '---'].join('\n'),
    );
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );

    await generator(host, {
      name: 'Collision Report Lifecycle',
      projectDocsAncestors: [
        'project-docs/bounded-contexts/collision-reporting.md',
        'project-docs/domain-terms/collision-report.md',
      ],
    });

    const content = host
      .read('project-docs/domain-models/collision-report-lifecycle.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [bounded-contexts:collision-reporting, domain-terms:collision-report]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        name: 'Collision Report Lifecycle',
        projectDocsAncestors: ['project-docs/bounded-contexts/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists('project-docs/domain-models/collision-report-lifecycle.md'),
    ).toBe(false);
    expect(host.exists('project-docs/domain-models/README.md')).toBe(false);
  });

  it('throws and makes no changes when the model file already exists', async () => {
    await generator(host, { name: 'Collision Report Lifecycle' });
    const before = host
      .read('project-docs/domain-models/collision-report-lifecycle.md')
      .toString();

    await expect(
      generator(host, { name: 'Collision Report Lifecycle' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read('project-docs/domain-models/collision-report-lifecycle.md')
        .toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { name: 'Collision Report Lifecycle' });

    const readme = host.read('project-docs/domain-models/README.md').toString();
    expect(readme).toContain('# Domain models');
    expect(readme).toContain('nx g @abgov/nx-agent:domain-model');
  });

  it('scopes the model file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      name: 'Collision Report Lifecycle',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/domain-models/collision-report-lifecycle.md',
      ),
    ).toBe(true);
    expect(
      host.exists('project-docs/domain-models/collision-report-lifecycle.md'),
    ).toBe(false);
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      name: 'Collision Report Lifecycle',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/domain-models/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { name: 'Case Lifecycle' });

    const rootReadme = host
      .read('project-docs/domain-models/README.md')
      .toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry expecting bounded-contexts/domain-terms ancestors', async () => {
    await generator(host, { name: 'Collision Report Lifecycle' });

    expect(readArtifactSchema(host)).toEqual({
      'domain-models': {
        expectedAncestorTypes: ['bounded-contexts', 'domain-terms'],
      },
    });
  });

  it('--resolves writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/open-questions/reviewer-authorization.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host, {
      name: 'Collision Report Lifecycle',
      resolves: ['project-docs/open-questions/reviewer-authorization.md'],
    });

    const content = host
      .read('project-docs/domain-models/collision-report-lifecycle.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:reviewer-authorization]',
    );
    expect(content).toContain(
      'resolves: [open-questions:reviewer-authorization]',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this domain model resolves open-questions:reviewer-authorization',
    );
    logSpy.mockRestore();
  });

  it('--resolves dedupes against an identical path already passed via --projectDocsAncestors', async () => {
    host.write(
      'project-docs/open-questions/reviewer-authorization.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );

    await generator(host, {
      name: 'Collision Report Lifecycle',
      projectDocsAncestors: [
        'project-docs/open-questions/reviewer-authorization.md',
      ],
      resolves: ['project-docs/open-questions/reviewer-authorization.md'],
    });

    const content = host
      .read('project-docs/domain-models/collision-report-lifecycle.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:reviewer-authorization]',
    );
    expect(content).not.toContain(
      'open-questions:reviewer-authorization, open-questions:reviewer-authorization',
    );
  });
});
