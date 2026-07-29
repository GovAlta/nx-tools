import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './open-question';

describe('nx-agent open-question generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the question file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { question: 'Reviewer Authorization' });

    const content = host
      .read('project-docs/open-questions/reviewer-authorization.md')
      .toString();
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('resolves --project-docs-ancestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/domain-terms/collision-report.md',
      ['---', 'term: Collision Report', '---'].join('\n'),
    );

    await generator(host, {
      question: 'Reviewer Authorization',
      projectDocsAncestors: ['project-docs/domain-terms/collision-report.md'],
    });

    const content = host
      .read('project-docs/open-questions/reviewer-authorization.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [domain-terms:collision-report]',
    );
  });

  it('throws and makes no changes when a --project-docs-ancestors path does not resolve', async () => {
    await expect(
      generator(host, {
        question: 'Reviewer Authorization',
        projectDocsAncestors: ['project-docs/domain-terms/nope.md'],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists('project-docs/open-questions/reviewer-authorization.md'),
    ).toBe(false);
    expect(host.exists('project-docs/open-questions/README.md')).toBe(false);
  });

  it('throws and makes no changes when the question file already exists', async () => {
    await generator(host, { question: 'Reviewer Authorization' });
    const before = host
      .read('project-docs/open-questions/reviewer-authorization.md')
      .toString();

    await expect(
      generator(host, { question: 'Reviewer Authorization' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host
        .read('project-docs/open-questions/reviewer-authorization.md')
        .toString(),
    ).toBe(before);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { question: 'Reviewer Authorization' });

    const readme = host
      .read('project-docs/open-questions/README.md')
      .toString();
    expect(readme).toContain('# Open questions');
    expect(readme).toContain('nx g @abgov/nx-agent:open-question');
  });

  it('scopes the question file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      question: 'Reviewer Authorization',
      project: 'domain-lib',
    });

    expect(
      host.exists(
        'libs/domain-lib/project-docs/open-questions/reviewer-authorization.md',
      ),
    ).toBe(true);
    expect(
      host.exists('project-docs/open-questions/reviewer-authorization.md'),
    ).toBe(false);
  });

  it('adds the shared-context note to the README only when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, {
      question: 'Reviewer Authorization',
      project: 'domain-lib',
    });

    const scopedReadme = host
      .read('libs/domain-lib/project-docs/open-questions/README.md')
      .toString();
    expect(scopedReadme).toContain(
      'shared by every project that depends on this library',
    );

    await generator(host, { question: 'Platform Intake Reuse' });

    const rootReadme = host
      .read('project-docs/open-questions/README.md')
      .toString();
    expect(rootReadme).not.toContain(
      'shared by every project that depends on this library',
    );
  });

  it('registers its own artifact-schema entry with tracksResolution and no expected ancestor type', async () => {
    await generator(host, { question: 'Reviewer Authorization' });

    expect(readArtifactSchema(host)).toEqual({
      'open-questions': {
        expectedAncestorTypes: [],
        tracksResolution: true,
      },
    });
  });
});
