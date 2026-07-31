import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './bug';

describe('nx-agent bug generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the bug file at the workspace root with the expected frontmatter, ancestors genuinely empty', async () => {
    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
    });

    const content = host
      .read(
        'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      )
      .toString();
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them, when known', async () => {
    host.write(
      'project-docs/requirements/submit-minor-collision-report.md',
      ['---', 'title: Submit Minor Collision Report', '---'].join('\n'),
    );

    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
      projectDocsAncestors: [
        'project-docs/requirements/submit-minor-collision-report.md',
      ],
    });

    const content = host
      .read(
        'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      )
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [requirements:submit-minor-collision-report]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        description: 'Submit Button Does Nothing On Slow Connections',
        projectDocsAncestors: ['project-docs/requirements/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists(
        'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      ),
    ).toBe(false);
    expect(host.exists('project-docs/bugs/README.md')).toBe(false);
  });

  it('throws and makes no changes when the bug file already exists', async () => {
    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
    });
    const before = host
      .read(
        'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      )
      .toString();

    await expect(
      generator(host, {
        description: 'Submit Button Does Nothing On Slow Connections',
      }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read(
          'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
        )
        .toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
    });

    const readme = host.read('project-docs/bugs/README.md').toString();
    expect(readme).toContain('# Bugs');
    expect(readme).toContain('nx g @abgov/nx-agent:bug');
  });

  it('scopes the bug file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      ),
    ).toBe(true);
    expect(
      host.exists(
        'project-docs/bugs/submit-button-does-nothing-on-slow-connections.md',
      ),
    ).toBe(false);
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/bugs/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { description: 'Other Bug' });

    const rootReadme = host.read('project-docs/bugs/README.md').toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry with tracksResolution and no expected ancestor type', async () => {
    await generator(host, {
      description: 'Submit Button Does Nothing On Slow Connections',
    });

    expect(readArtifactSchema(host)).toEqual({
      bugs: {
        expectedAncestorTypes: [],
        tracksResolution: true,
      },
    });
  });
});
