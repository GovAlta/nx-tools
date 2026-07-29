import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './blocker';

describe('nx-agent blocker generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the blocker file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { description: 'Cant Ship Payment Flow' });

    const content = host
      .read('project-docs/blockers/cant-ship-payment-flow.md')
      .toString();
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/domain-models/collision-report-lifecycle.md',
      ['---', 'name: Collision Report Lifecycle', '---'].join('\n'),
    );

    await generator(host, {
      description: 'Cant Ship Payment Flow',
      projectDocsAncestors: [
        'project-docs/domain-models/collision-report-lifecycle.md',
      ],
    });

    const content = host
      .read('project-docs/blockers/cant-ship-payment-flow.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [domain-models:collision-report-lifecycle]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        description: 'Cant Ship Payment Flow',
        projectDocsAncestors: ['project-docs/domain-models/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(host.exists('project-docs/blockers/cant-ship-payment-flow.md')).toBe(
      false,
    );
    expect(host.exists('project-docs/blockers/README.md')).toBe(false);
  });

  it('throws and makes no changes when the blocker file already exists', async () => {
    await generator(host, { description: 'Cant Ship Payment Flow' });
    const before = host
      .read('project-docs/blockers/cant-ship-payment-flow.md')
      .toString();

    await expect(
      generator(host, { description: 'Cant Ship Payment Flow' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host.read('project-docs/blockers/cant-ship-payment-flow.md').toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { description: 'Cant Ship Payment Flow' });

    const readme = host.read('project-docs/blockers/README.md').toString();
    expect(readme).toContain('# Blockers');
    expect(readme).toContain('nx g @abgov/nx-agent:blocker');
  });

  it('scopes the blocker file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      description: 'Cant Ship Payment Flow',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/blockers/cant-ship-payment-flow.md',
      ),
    ).toBe(true);
    expect(host.exists('project-docs/blockers/cant-ship-payment-flow.md')).toBe(
      false,
    );
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      description: 'Cant Ship Payment Flow',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/blockers/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { description: 'Other Blocker' });

    const rootReadme = host.read('project-docs/blockers/README.md').toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry with tracksResolution and no expected ancestor type', async () => {
    await generator(host, { description: 'Cant Ship Payment Flow' });

    expect(readArtifactSchema(host)).toEqual({
      blockers: {
        expectedAncestorTypes: [],
        tracksResolution: true,
      },
    });
  });
});
