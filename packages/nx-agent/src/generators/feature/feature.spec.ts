import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './feature';

describe('nx-agent feature generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the feature file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    const content = host
      .read('project-docs/features/submit-minor-collision-report.md')
      .toString();
    expect(content).toContain('title: Submit Minor Collision Report');
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/service-descriptions/collision-reporting.md',
      ['---', 'service: Collision Reporting', '---'].join('\n'),
    );

    await generator(host, {
      title: 'Submit Minor Collision Report',
      projectDocsAncestors: [
        'project-docs/service-descriptions/collision-reporting.md',
      ],
    });

    const content = host
      .read('project-docs/features/submit-minor-collision-report.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [service-descriptions:collision-reporting]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        title: 'Submit Minor Collision Report',
        projectDocsAncestors: ['project-docs/service-descriptions/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists('project-docs/features/submit-minor-collision-report.md'),
    ).toBe(false);
    expect(host.exists('project-docs/features/README.md')).toBe(false);
  });

  it('throws and makes no changes when the feature file already exists', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });
    const before = host
      .read('project-docs/features/submit-minor-collision-report.md')
      .toString();

    await expect(
      generator(host, { title: 'Submit Minor Collision Report' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read('project-docs/features/submit-minor-collision-report.md')
        .toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    const readme = host.read('project-docs/features/README.md').toString();
    expect(readme).toContain('# Features');
    expect(readme).toContain('nx g @abgov/nx-agent:feature');
  });

  it('scopes the feature file under a specific project when --project is given', async () => {
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
        'libs/domain-lib/project-docs/features/submit-minor-collision-report.md',
      ),
    ).toBe(true);
    expect(
      host.exists('project-docs/features/submit-minor-collision-report.md'),
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
      .read('libs/domain-lib/project-docs/features/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { title: 'Second Feature' });

    const rootReadme = host.read('project-docs/features/README.md').toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry with no expected ancestor type and no tracksResolution', async () => {
    await generator(host, { title: 'Submit Minor Collision Report' });

    expect(readArtifactSchema(host)).toEqual({
      features: { expectedAncestorTypes: [] },
    });
  });

  it('--resolves writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/open-questions/reviewer-authorization.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host, {
      title: 'Submit Minor Collision Report',
      resolves: ['project-docs/open-questions/reviewer-authorization.md'],
    });

    const content = host
      .read('project-docs/features/submit-minor-collision-report.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:reviewer-authorization]',
    );
    expect(content).toContain(
      'resolves: [open-questions:reviewer-authorization]',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this feature resolves open-questions:reviewer-authorization',
    );
    logSpy.mockRestore();
  });

  it('--resolves dedupes against an identical path already passed via --projectDocsAncestors', async () => {
    host.write(
      'project-docs/open-questions/reviewer-authorization.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );

    await generator(host, {
      title: 'Submit Minor Collision Report',
      projectDocsAncestors: [
        'project-docs/open-questions/reviewer-authorization.md',
      ],
      resolves: ['project-docs/open-questions/reviewer-authorization.md'],
    });

    const content = host
      .read('project-docs/features/submit-minor-collision-report.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:reviewer-authorization]',
    );
    expect(content).not.toContain(
      'open-questions:reviewer-authorization, open-questions:reviewer-authorization',
    );
  });
});
