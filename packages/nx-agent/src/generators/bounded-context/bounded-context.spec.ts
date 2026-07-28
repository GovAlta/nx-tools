import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './bounded-context';

describe('nx-agent bounded-context generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the context file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { name: 'Collision Reporting' });

    const content = host
      .read('project-docs/bounded-contexts/collision-reporting.md')
      .toString();
    expect(content).toContain('name: Collision Reporting');
    expect(content).toContain('aliases: []');
    expect(content).toContain('not_confused_with: []');
  });

  it('derives the filename slug from a multi-word name', async () => {
    await generator(host, { name: 'Collision Reporting' });

    expect(
      host.exists('project-docs/bounded-contexts/collision-reporting.md'),
    ).toBe(true);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { name: 'Collision Reporting' });

    const readme = host
      .read('project-docs/bounded-contexts/README.md')
      .toString();
    expect(readme).toContain('# Bounded contexts');
    expect(readme).toContain('nx g @abgov/nx-agent:bounded-context');
  });

  it('does not duplicate or alter the README when a second, different context is added', async () => {
    await generator(host, { name: 'Collision Reporting' });
    const readmeBefore = host
      .read('project-docs/bounded-contexts/README.md')
      .toString();

    await generator(host, { name: 'Case Management' });

    const readmeAfter = host
      .read('project-docs/bounded-contexts/README.md')
      .toString();
    expect(readmeAfter).toBe(readmeBefore);
    expect(
      host.exists('project-docs/bounded-contexts/collision-reporting.md'),
    ).toBe(true);
    expect(
      host.exists('project-docs/bounded-contexts/case-management.md'),
    ).toBe(true);
  });

  it('throws and makes no changes when the context file already exists', async () => {
    await generator(host, { name: 'Collision Reporting' });
    const before = host
      .read('project-docs/bounded-contexts/collision-reporting.md')
      .toString();

    await expect(
      generator(host, { name: 'Collision Reporting' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read('project-docs/bounded-contexts/collision-reporting.md')
        .toString(),
    ).toBe(before);
  });

  it('scopes the context file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      name: 'Collision Reporting',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/bounded-contexts/collision-reporting.md',
      ),
    ).toBe(true);
    expect(
      host.exists('project-docs/bounded-contexts/collision-reporting.md'),
    ).toBe(false);
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      name: 'Collision Reporting',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/bounded-contexts/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { name: 'Case Management' });

    const rootReadme = host
      .read('project-docs/bounded-contexts/README.md')
      .toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry with no expected ancestor types', async () => {
    await generator(host, { name: 'Collision Reporting' });

    expect(readArtifactSchema(host)).toEqual({
      'bounded-contexts': { expectedAncestorTypes: [] },
    });
  });
});
