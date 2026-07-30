import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './iteration-retrospective';

describe('nx-agent iteration-retrospective generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the retrospective file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    const content = host
      .read(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      )
      .toString();
    expect(content).toContain('title: Submit Minor Collision Report');
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/requirements/submit-minor-collision-report.md',
      ['---', 'name: Submit Minor Collision Report', '---'].join('\n'),
    );

    await generator(host, {
      title: 'Submit Minor Collision Report',
      projectDocsAncestors: [
        'project-docs/requirements/submit-minor-collision-report.md',
      ],
    });

    const content = host
      .read(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      )
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [requirements:submit-minor-collision-report]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        title: 'Submit Minor Collision Report',
        projectDocsAncestors: ['project-docs/requirements/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      ),
    ).toBe(false);
    expect(host.exists('project-docs/iteration-retrospectives/README.md')).toBe(
      false,
    );
  });

  it('throws and makes no changes when the retrospective file already exists', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });
    const before = host
      .read(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      )
      .toString();

    await expect(
      generator(host, { title: 'Submit Minor Collision Report' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read(
          'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
        )
        .toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    const readme = host
      .read('project-docs/iteration-retrospectives/README.md')
      .toString();
    expect(readme).toContain('# Iteration retrospectives');
    expect(readme).toContain('nx g @abgov/nx-agent:iteration-retrospective');
  });

  it('scopes the retrospective file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      title: 'Submit Minor Collision Report',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      ),
    ).toBe(true);
    expect(
      host.exists(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
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
      title: 'Submit Minor Collision Report',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/iteration-retrospectives/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { title: 'Second Pass' });

    const rootReadme = host
      .read('project-docs/iteration-retrospectives/README.md')
      .toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry as terminal, with no tracksResolution and no expected ancestor type', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    expect(readArtifactSchema(host)).toEqual({
      'iteration-retrospectives': {
        expectedAncestorTypes: [],
        terminal: true,
      },
    });
  });

  it('--resolves writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/blockers/no-write-packages-credential.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host, {
      title: 'Submit Minor Collision Report',
      resolves: ['project-docs/blockers/no-write-packages-credential.md'],
    });

    const content = host
      .read(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      )
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [blockers:no-write-packages-credential]',
    );
    expect(content).toContain(
      'resolves: [blockers:no-write-packages-credential]',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this iteration retrospective resolves blockers:no-write-packages-credential',
    );
    logSpy.mockRestore();
  });

  it('--resolves dedupes against an identical path already passed via --projectDocsAncestors', async () => {
    host.write(
      'project-docs/blockers/no-write-packages-credential.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );

    await generator(host, {
      title: 'Submit Minor Collision Report',
      projectDocsAncestors: [
        'project-docs/blockers/no-write-packages-credential.md',
      ],
      resolves: ['project-docs/blockers/no-write-packages-credential.md'],
    });

    const content = host
      .read(
        'project-docs/iteration-retrospectives/submit-minor-collision-report.md',
      )
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [blockers:no-write-packages-credential]',
    );
    expect(content).not.toContain(
      'blockers:no-write-packages-credential, blockers:no-write-packages-credential',
    );
  });
});
